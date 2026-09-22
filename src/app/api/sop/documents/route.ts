import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import type { SopUserContext } from '@/lib/sop-context';
import { SCOPE_OPTIONS, SUB_CATEGORY_OPTIONS, detectSourceType } from '@/lib/sop-taxonomy';
import { runSopRefine } from '@/lib/sop-refine';
import { getScopeSyncStats, formatSyncDetail, syncStatusLabel, ScopeSyncStats } from '@/lib/sop-sync';
import { sniffFile, extractFileText, MAX_DOC_BYTES, MAX_IMAGE_BYTES } from '@/lib/file-extract';
import { ensureSopBucket, uploadSopFile, deleteSopFile } from '@/lib/sop-storage';
import { buildImagesPdf, isEmbeddableImageExt } from '@/lib/img-to-pdf';

const LIST_SELECT = [
  'id',
  'doc_type',
  'title',
  'category',
  'sub_category',
  'scope',
  'applicable_post',
  'applicable_brand',
  'source_type',
  'external_url',
  'visibility',
  'needs_quiz',
  'status',
  'version',
  'ai_summary',
  'ai_keypoints',
  'ai_status',
  'ai_error',
  'content_excerpt',
  'uploaded_by',
  'uploader_name',
  'is_active',
  'remark',
  'created_at',
  'updated_at',
  'prev_version_at',
  'file_url',
  'file_name',
  'file_kind',
  'mime_type',
  'file_size',
].join(',');

// GET /api/sop/documents?scope=&sub_category=&doc_type=&keyword=
// 权限：外部合作→空；PM/运营→全部 4 域；其他内部角色→general + 自身 brand 域。
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get('scope') || '';
    const subCategory = searchParams.get('sub_category') || '';
    const docType = searchParams.get('doc_type') || 'all';
    const keyword = searchParams.get('keyword') || '';

    const client = getSupabaseClient();

    // 外部合作维持现状：列表为空
    if (ctx.isExternal) {
      return NextResponse.json({ success: true, docs: [], scopes: [], canUpload: false });
    }

    const visible = ctx.scopes;
    const scopesFilter = scope && visible.includes(scope as never) ? [scope] : visible;

    let query = client
      .from('sop_documents')
      .select(LIST_SELECT)
      .eq('status', 'published')
      .eq('is_active', true)
      .in('scope', scopesFilter as string[])
      .order('updated_at', { ascending: false });

    if (subCategory) query = query.eq('sub_category', subCategory);
    if (docType && docType !== 'all') query = query.eq('doc_type', docType);
    if (keyword) query = query.or(`title.ilike.%${keyword}%,ai_summary.ilike.%${keyword}%`);

    const { data: docs, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    // 组装当前用户已读集合
    const readSet = new Set<string>();
    if (ctx.userId) {
      const { data: logs } = await client
        .from('sop_read_logs')
        .select('doc_id')
        .eq('user_id', ctx.userId);
      (logs ?? []).forEach((l) => readSet.add(l.doc_id as string));
    }

    const rows = (docs ?? []) as unknown as Array<{ id: string; scope: string } & Record<string, unknown>>;

    // 按业务线实时计算分发统计（每个 scope 算一次）
    const syncMap = new Map<string, ScopeSyncStats>();
    const sync = await getScopeSyncStats(rows.map((d) => d.scope));
    sync.forEach((s, k) => syncMap.set(k, s));

    const result = rows.map((d) => {
      const stats = syncMap.get(d.scope) ?? { total: 0, anchor: 0, ops: 0, pm: 0, mid: 0 };
      return {
        ...d,
        read: readSet.has(d.id),
        synced_count: stats.total,
        sync_detail: formatSyncDetail(stats),
        sync_status: syncStatusLabel(d.ai_status as string | null, stats),
      };
    });

    return NextResponse.json({
      success: true,
      docs: result,
      scopes: visible,
      canUpload: ctx.canUpload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/sop/documents  仅 PM / 运营 / 超级管理员；触发异步 AI 提炼。
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (!ctx.canUpload) {
      return NextResponse.json({ error: '无权限：仅 PM / 运营可上传 SOP 内容' }, { status: 403 });
    }

    const isMultipart = (request.headers.get('content-type') || '').includes('multipart/form-data');

    if (isMultipart) {
      return await handleFileUpload(request, ctx);
    }

    const body = await request.json();
    const title = String(body.title || '').trim();
    const externalUrl = String(body.external_url || '').trim();
    const subCategory = String(body.sub_category || '');
    const scope = String(body.scope || '');
    const docType = [String(body.doc_type || 'training')].includes('management') ? 'management' : 'training';
    const manualKeypoints = (Array.isArray(body.manual_keypoints)
      ? body.manual_keypoints
      : Array.isArray(body.manualKeypoints)
        ? body.manualKeypoints
        : []) as string[];
    const remark = String(body.remark || '').trim();
    const needsQuiz = !!body.needs_quiz;
    const contentExcerpt = String(body.content_excerpt || '').trim();

    if (!title) return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    if (!externalUrl) return NextResponse.json({ error: '请提供飞书或腾讯文档链接' }, { status: 400 });
    if (!/^https?:\/\//i.test(externalUrl)) return NextResponse.json({ error: '链接必须为 http(s) 地址' }, { status: 400 });
    if (!SCOPE_OPTIONS.some((s) => s.value === scope)) return NextResponse.json({ error: '一级业务域不合法' }, { status: 400 });
    if (!SUB_CATEGORY_OPTIONS.some((s) => s.value === subCategory)) return NextResponse.json({ error: '二级类目不合法' }, { status: 400 });

    const sourceType = detectSourceType(externalUrl);
    if (sourceType === 'manual') {
      return NextResponse.json({ error: '仅支持飞书(feishu.cn / larksuite.com)或腾讯文档(docs.qq.com)链接' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: inserted, error } = await client
      .from('sop_documents')
      .insert({
        title,
        doc_type: docType,
        scope,
        sub_category: subCategory,
        source_type: sourceType,
        external_url: externalUrl,
        visibility: 'internal',
        status: 'published',
        needs_quiz: needsQuiz,
        ai_status: 'pending',
        is_active: true,
        uploaded_by: ctx.userId,
        uploader_name: ctx.name,
        remark,
        content_excerpt: contentExcerpt || null,
        applicable_brand: ['vivo&iQOO'],
        applicable_post: null,
        category: null,
      })
      .select('id')
      .single();
    if (error) throw new Error(`写入失败: ${error.message}`);
    if (!inserted) throw new Error('写入后未返回文档');

    const newId = inserted.id as string;
    // 异步提炼，不阻塞响应
    void runSopRefine(newId, manualKeypoints);

    return NextResponse.json({ success: true, id: newId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

type SopUserContextForUpload = SopUserContext;

interface ParsedMultipart {
  title: string;
  scope: string;
  subCategory: string;
  docType: string;
  needsQuiz: boolean;
  remark: string;
  mergeImages: boolean;
  files: File[];
}

interface PreparedFile {
  file: File;
  name: string;
  buf: Buffer;
  sniff: ReturnType<typeof sniffFile>;
}

interface UploadResult {
  id: string;
  title: string;
}

// 把单个文件对象写入存储并返回 key（失败会抛错，由外层清理）
async function uploadObject(buf: Buffer, name: string, mime: string): Promise<string> {
  const key = await uploadSopFile(buf, name, mime);
  return key;
}

// 生成多页/单页 PDF（由 jpg/jpeg/png 图片合成，页面贴合图片尺寸、不留白边）
async function buildPdfFromImages(images: PreparedFile[]): Promise<Buffer> {
  return buildImagesPdf(
    images.map((i) => ({ buffer: i.buf, mime: i.sniff.mime as string })),
  );
}

async function handleFileUpload(request: NextRequest, ctx: SopUserContextForUpload) {
  // 本轮会写入多个对象（PDF + 若干原图），任何一步失败都统一清理
  const writtenKeys: string[] = [];
  // 登记已写入对象 key，供失败统一清理
  const trackWrite = (k: string) => { writtenKeys.push(k); return k; };

  try {
    const form = await request.formData();
    const title = String(form.get('title') || '').trim();
    const scope = String(form.get('scope') || '');
    const subCategory = String(form.get('sub_category') || '');
    const docType = [String(form.get('doc_type') || 'training')].includes('management') ? 'management' : 'training';
    const needsQuiz = ['true', '1', 'on'].includes(String(form.get('needs_quiz') || ''));
    const remark = String(form.get('remark') || '').trim();
    const mergeImages = ['true', '1', 'on'].includes(String(form.get('merge_images') || ''));
    const rawFiles = form.getAll('file') as unknown[];

    const files = rawFiles.filter((x): x is File => !!x && typeof x === 'object' && 'arrayBuffer' in (x as File));
    if (files.length === 0) return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 });
    if (!SCOPE_OPTIONS.some((s) => s.value === scope)) return NextResponse.json({ error: '一级业务域不合法' }, { status: 400 });
    if (!SUB_CATEGORY_OPTIONS.some((s) => s.value === subCategory)) return NextResponse.json({ error: '二级类目不合法' }, { status: 400 });

    // 逐文件预处理：嗅探 + 大小校验（白名单 + 魔数）
    const prepared: PreparedFile[] = [];
    for (const f of files) {
      const name = (f.name || 'upload').replace(/[\\/]/g, '_');
      const buf = Buffer.from(await f.arrayBuffer());
      const sniff = sniffFile(name, f.type, buf.subarray(0, 512));
      if (!sniff.ok) return NextResponse.json({ error: `${name}: ${sniff.reason}` }, { status: 400 });
      const max = sniff.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
      if (buf.length > max) {
        return NextResponse.json({
          error: `${name}: 文件大小超限（${sniff.kind === 'image' ? '图片不超过 10MB' : '文档不超过 30MB'}）`,
        }, { status: 400 });
      }
      prepared.push({ file: f, name, buf, sniff });
    }

    await ensureSopBucket();

    const client = getSupabaseClient();
    const results: UploadResult[] = [];

    // 图片是否可转（仅 jpg/jpeg/png）
    const isImg = (p: PreparedFile) => p.sniff.kind === 'image' && isEmbeddableImageExt(p.sniff.ext);

    // 合并模式：把所有可转图片合成为一个多页 PDF → 仅 1 条文档；不可转文件各自独立创建
    const convertible = prepared.filter(isImg);
    const others = prepared.filter((p) => !isImg(p));

    // 把单个已预处理文件落库为一条记录（可转图片→单页 PDF+原图；否则原样入库）
    async function createFileRecord(
      p: PreparedFile,
      baseTitle: string,
      o: { titleFallback: string },
    ): Promise<UploadResult> {
      const useTitle = (baseTitle && baseTitle.trim()) || o.titleFallback;
      let fileUrl = '';
      let fileName = p.name;
      let fileKind = p.sniff.kind as string;
      let mime = p.sniff.mime as string;
      let fileSize = p.buf.length;
      let contentBody = '';
      let originalKeys: string[] = [];
      let originalMimes: string[] = [];
      let skipRefine = false;

      if (isImg(p)) {
        // 单张可转图片 → 单页 PDF（原图保留）
        const pdfBuf = await buildPdfFromImages([p]);
        const pdfKey = trackWrite(await uploadObject(pdfBuf, `${stripExt(p.name) || 'image'}.pdf`, 'application/pdf'));
        const ok = trackWrite(await uploadObject(p.buf, p.name, p.sniff.mime as string));
        fileUrl = pdfKey;
        fileName = `${stripExt(p.name)}.pdf`;
        fileKind = 'pdf';
        mime = 'application/pdf';
        fileSize = pdfBuf.length;
        originalKeys = [ok];
        originalMimes = [p.sniff.mime as string];
        skipRefine = true; // 图片 PDF 无文字层，不触发 AI 摘要
      } else {
        fileUrl = trackWrite(await uploadObject(p.buf, p.name, p.sniff.mime as string));
        try {
          contentBody = await extractFileText(p.sniff.kind as string, p.buf);
        } catch {
          contentBody = '';
        }
      }

      const { data: inserted, error } = await client
        .from('sop_documents')
        .insert({
          title: useTitle,
          doc_type: docType,
          scope,
          sub_category: subCategory,
          source_type: 'file',
          file_url: fileUrl,
          file_name: fileName,
          file_kind: fileKind,
          mime_type: mime,
          file_size: fileSize,
          content_body: contentBody || null,
          ...(originalKeys.length ? {
            original_file_url: JSON.stringify(originalKeys),
            original_mime_type: JSON.stringify(originalMimes),
          } : {}),
          visibility: 'internal',
          status: 'published',
          needs_quiz: needsQuiz,
          ai_status: 'pending',
          is_active: true,
          uploaded_by: ctx.userId,
          uploader_name: ctx.name,
          remark: remark || null,
          applicable_brand: ['vivo&iQOO'],
        })
        .select('id')
        .single();
      if (error) throw new Error(`写入失败: ${error.message}`);
      if (!inserted) throw new Error('写入后未返回文档');
      const id = inserted.id as string;
      if (contentBody && !skipRefine) void runSopRefine(id);
      return { id, title: useTitle };
    }

    if (mergeImages && convertible.length > 0) {
      // 合并模式：可转图片 → 一个多页 PDF（仅 1 条记录）；不可转文件各自独立创建
      const baseTitle = title || '多图合并';
      const pdfBuf = await buildPdfFromImages(convertible);
      const pdfKey = trackWrite(await uploadObject(pdfBuf, `${stripExt(baseTitle) || 'images'}.pdf`, 'application/pdf'));
      // 原图各自保留
      const originalKeys: string[] = [];
      const originalMimes: string[] = [];
      for (const p of convertible) {
        const k = trackWrite(await uploadObject(p.buf, p.name, p.sniff.mime as string));
        originalKeys.push(k);
        originalMimes.push(p.sniff.mime as string);
      }
      const { data: inserted, error } = await client
        .from('sop_documents')
        .insert({
          title: baseTitle,
          doc_type: docType,
          scope,
          sub_category: subCategory,
          source_type: 'file',
          file_url: pdfKey,
          file_name: `${stripExt(baseTitle)}.pdf`,
          file_kind: 'pdf',
          mime_type: 'application/pdf',
          file_size: pdfBuf.length,
          content_body: null, // 图片 PDF 无文字层，不做 OCR
          original_file_url: JSON.stringify(originalKeys),
          original_mime_type: JSON.stringify(originalMimes),
          visibility: 'internal',
          status: 'published',
          needs_quiz: needsQuiz,
          ai_status: 'pending',
          is_active: true,
          uploaded_by: ctx.userId,
          uploader_name: ctx.name,
          remark: remark || null,
          applicable_brand: ['vivo&iQOO'],
        })
        .select('id')
        .single();
      if (error) throw new Error(`写入失败: ${error.message}`);
      if (!inserted) throw new Error('写入后未返回文档');
      results.push({ id: inserted.id as string, title: baseTitle });
      // 混合上传：不可转文件（gif/webp/bmp/svg/pdf/txt 等）逐一独立创建，互不干扰
      for (const p of others) {
        results.push(await createFileRecord(p, '', { titleFallback: stripExt(p.name) || '文件' }));
      }
    } else {
      // 逐文件独立创建：可转图片各自生成单页 PDF，其它文件维持原样
      for (const p of prepared) {
        results.push(await createFileRecord(p, title, { titleFallback: stripExt(p.name) || '文件' }));
      }
    }

    return NextResponse.json({ success: true, docs: results, count: results.length }, { status: 201 });
  } catch (err) {
    // 失败清理本轮已写对象，避免半截对象残留
    for (const k of writtenKeys) {
      try { await deleteSopFile(k); } catch { /* ignore */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}