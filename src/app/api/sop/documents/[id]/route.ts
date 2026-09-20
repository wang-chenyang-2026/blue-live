import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { SCOPE_OPTIONS, detectSourceType } from '@/lib/sop-taxonomy';
import { runSopRefine } from '@/lib/sop-refine';

// GET /api/sop/documents/[id]
// 权限：外部合作→404；内部角色需落在其可见域内，否则 404。
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    const client = getSupabaseClient();

    if (ctx.isExternal) {
      return NextResponse.json({ success: false, error: '文档不存在或无权访问' }, { status: 404 });
    }

    const { data, error } = await client
      .from('sop_documents')
      .select(
        'id, doc_type, title, category, sub_category, scope, applicable_post, applicable_brand, source_type, external_url, visibility, needs_quiz, status, version, ai_summary, ai_keypoints, ai_status, ai_error, uploaded_by, uploader_name, is_active, remark, created_at, updated_at'
      )
      .eq('id', id)
      .eq('status', 'published')
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(`查询失败: ${error.message}`);

    if (!data || !ctx.scopes.includes(data.scope as never)) {
      return NextResponse.json({ success: false, error: '文档不存在或无权访问' }, { status: 404 });
    }

    return NextResponse.json({ success: true, doc: data, canUpload: ctx.canUpload });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/sop/documents/[id]  仅 PM / 运营；编辑链接/分类后重置 ai_status 并重新提炼。
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (!ctx.canUpload) {
      return NextResponse.json({ error: '无权限：仅 PM / 运营可编辑 SOP 内容' }, { status: 403 });
    }

    const body = await request.json();
    const patch: Record<string, unknown> = {};

    const externalUrl = body.external_url !== undefined ? String(body.external_url).trim() : undefined;
    if (externalUrl !== undefined) {
      if (!/^https?:\/\//i.test(externalUrl)) return NextResponse.json({ error: '链接必须为 http(s) 地址' }, { status: 400 });
      const sourceType = detectSourceType(externalUrl);
      if (sourceType === 'manual') {
        return NextResponse.json({ error: '仅支持飞书(feishu.cn / larksuite.com)或腾讯文档(docs.qq.com)链接' }, { status: 400 });
      }
      patch.external_url = externalUrl;
      patch.source_type = sourceType;
    }
    const scope = body.scope !== undefined ? String(body.scope) : undefined;
    if (scope !== undefined) {
      if (!SCOPE_OPTIONS.some((s) => s.value === scope)) return NextResponse.json({ error: '一级业务域不合法' }, { status: 400 });
      patch.scope = scope;
    }
    if (body.sub_category !== undefined) patch.sub_category = String(body.sub_category);
    if (body.title !== undefined && String(body.title).trim()) patch.title = String(body.title).trim();
    if (body.remark !== undefined) patch.remark = String(body.remark).trim();
    if (body.manual_keypoints !== undefined) {
      patch.ai_keypoints = Array.isArray(body.manual_keypoints) ? body.manual_keypoints : [];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '无有效更新字段' }, { status: 400 });
    }

    // 内容变更 → 重置提炼状态并重跑
    patch.ai_status = 'processing';
    patch.ai_error = null;

    const client = getSupabaseClient();
    const { error } = await client.from('sop_documents').update(patch).eq('id', id);
    if (error) throw new Error(`更新失败: ${error.message}`);

    const manual = Array.isArray(body.manual_keypoints) ? (body.manual_keypoints as string[]) : [];
    void runSopRefine(id, manual);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}