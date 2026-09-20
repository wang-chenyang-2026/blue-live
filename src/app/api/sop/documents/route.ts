import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { SCOPE_OPTIONS, SUB_CATEGORY_OPTIONS, detectSourceType } from '@/lib/sop-taxonomy';
import { runSopRefine } from '@/lib/sop-refine';

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
  'uploaded_by',
  'uploader_name',
  'is_active',
  'remark',
  'created_at',
  'updated_at',
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
    if (keyword) query = query.ilike('title', `%${keyword}%`);

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

    const rows = (docs ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
    const result = rows.map((d) => ({ ...d, read: readSet.has(d.id) }));

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

    const body = await request.json();
    const title = String(body.title || '').trim();
    const externalUrl = String(body.external_url || '').trim();
    const scope = String(body.scope || '');
    const subCategory = String(body.sub_category || '');
    const docType = [String(body.doc_type || 'training')].includes('management') ? 'management' : 'training';
    const manualKeypoints = (Array.isArray(body.manual_keypoints)
      ? body.manual_keypoints
      : Array.isArray(body.manualKeypoints)
        ? body.manualKeypoints
        : []) as string[];
    const remark = String(body.remark || '').trim();

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
        needs_quiz: false,
        ai_status: 'pending',
        is_active: true,
        uploaded_by: ctx.userId,
        uploader_name: ctx.name,
        remark,
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