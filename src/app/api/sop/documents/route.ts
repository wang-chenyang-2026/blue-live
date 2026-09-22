import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import type { SopUserContext } from '@/lib/sop-context';
import { SCOPE_OPTIONS, SUB_CATEGORY_OPTIONS, detectSourceType } from '@/lib/sop-taxonomy';
import { runSopRefine } from '@/lib/sop-refine';
import { getScopeSyncStats, formatSyncDetail, syncStatusLabel, ScopeSyncStats } from '@/lib/sop-sync';
import { sniffFile, extractFileText, MAX_DOC_BYTES, MAX_IMAGE_BYTES } from '@/lib/file-extract';
import { ensureSopBucket, uploadSopFile, deleteSopFile } from '@/lib/sop-storage';

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

async function handleFileUpload(request: NextRequest, ctx: SopUserContextForUpload) {
  // 参数在 try 内校验，失败时清理已写对象
  let objectKey: string | null = null;
  try {
    const form = await request.formData();
    const title = String(form.get('title') || '').trim();
    const scope = String(form.get('scope') || '');
    const subCategory = String(form.get('sub_category') || '');
    const docType = [String(form.get('doc_type') || 'training')].includes('management') ? 'management' : 'training';
    const needsQuiz = ['true', '1', 'on'].includes(String(form.get('needs_quiz') || ''));
    const remark = String(form.get('remark') || '').trim();
    const file = form.get('file');

    if (!title) return NextResponse.json({ error: '标题不能为空' }, { status: 400 });
    if (!file || typeof file !== 'object' || !('arrayBuffer' in (file as File))) {
      return NextResponse.json({ error: '请选择要上传的文件' }, { status: 400 });
    }
    const f = file as File;
    if (!SCOPE_OPTIONS.some((s) => s.value === scope)) return NextResponse.json({ error: '一级业务域不合法' }, { status: 400 });
    if (!SUB_CATEGORY_OPTIONS.some((s) => s.value === subCategory)) return NextResponse.json({ error: '二级类目不合法' }, { status: 400 });

    const name = f.name || 'upload';
    const buf = Buffer.from(await f.arrayBuffer());
    const sniff = sniffFile(name, f.type, buf.subarray(0, 512));
    if (!sniff.ok) return NextResponse.json({ error: sniff.reason }, { status: 400 });

    const max = sniff.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (buf.length > max) {
      return NextResponse.json({
        error: `文件大小超限：${sniff.kind === 'image' ? '图片不超过 10MB' : '文档不超过 30MB'}（当前 ${(buf.length / (1024 * 1024)).toFixed(1)}MB）`,
      }, { status: 400 });
    }

    await ensureSopBucket();
    objectKey = await uploadSopFile(buf, name, sniff.mime as string);

    let contentBody = '';
    try {
      contentBody = await extractFileText(sniff.kind as string, buf);
    } catch {
      contentBody = '';
    }

    const client = getSupabaseClient();
    const { data: inserted, error } = await client
      .from('sop_documents')
      .insert({
        title,
        doc_type: docType,
        scope,
        sub_category: subCategory,
        source_type: 'file',
        file_url: objectKey,
        file_name: name,
        file_kind: sniff.kind,
        mime_type: sniff.mime,
        file_size: buf.length,
        content_body: contentBody || null,
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

    const newId = inserted.id as string;
    // 文件文档正文 = content_body，提炼服务按 source_type=file 取正文（无 BLUEAI key 时稳定降级）
    void runSopRefine(newId);

    return NextResponse.json({ success: true, id: newId }, { status: 201 });
  } catch (err) {
    // 失败清理已写入对象，避免半截对象残留
    if (objectKey) {
      try { await deleteSopFile(objectKey); } catch { /* ignore */ }
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}