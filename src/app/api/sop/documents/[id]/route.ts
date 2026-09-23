import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { SCOPE_OPTIONS, detectSourceType } from '@/lib/sop-taxonomy';
import { runSopRefine } from '@/lib/sop-refine';
import { fetchFeishuDoc } from '@/lib/sop-ai';
import { resolveFeishuUserToken, sanitizeFeishuMsg } from '@/lib/feishu-perm';
import { computeScopeSync, formatSyncDetail, syncStatusLabel } from '@/lib/sop-sync';
import { sopFileSignedUrl } from '@/lib/sop-storage';

/** 按文档提交人 user_id 查其手机号（用于回退读取其飞书 user 身份），查不到返回 null。 */
async function resolveSubmitterPhone(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await getSupabaseClient().from('users').select('phone').eq('id', userId).maybeSingle();
    return (data?.phone as string | undefined) ?? null;
  } catch {
    return null;
  }
}

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

    const cur = await client
      .from('sop_documents')
      .select(
        'id, doc_type, title, category, sub_category, scope, applicable_post, applicable_brand, source_type, external_url, file_url, file_name, file_kind, mime_type, file_size, original_file_url, original_mime_type, visibility, needs_quiz, status, version, content_excerpt, content_body, content_sheet, prev_version_at, ai_summary, ai_keypoints, ai_status, ai_error, uploaded_by, uploader_name, is_active, remark, perm_status, perm_source, perm_at, fetch_as, fetch_error, created_at, updated_at'
      )
      .eq('id', id)
      .eq('status', 'published')
      .eq('is_active', true)
      .maybeSingle();
    if (cur.error) throw new Error(`查询失败: ${cur.error.message}`);
    const data = cur.data;
    if (!data || !ctx.scopes.includes(data.scope as never)) {
      return NextResponse.json({ success: false, error: '文档不存在或无权访问' }, { status: 404 });
    }

    const stats = await computeScopeSync(data.scope as string);

    // 原文内联展示：飞书正文未落库时实时抓（bot 优先→提交人 user 回退）并回存；
    // 失败按「待授权」归类并记录审计字段（仅飞书；腾讯无开放接口、失败则降级，不向客户端抛错）
    const isFeishu = data.source_type === 'feishu' && !!data.external_url;
    if (isFeishu && !data.content_body) {
      const submitterPhone = await resolveSubmitterPhone(data.uploaded_by as string | null);
      const userToken = resolveFeishuUserToken([ctx.phone, submitterPhone]);
      const fr = await fetchFeishuDoc(data.external_url as string, userToken);
      if (fr.ok) {
        const patch: Record<string, unknown> = { content_body: fr.content, fetch_as: fr.readAs, fetch_error: null };
        if (!data.perm_status) patch.perm_status = 'ok';
        await client.from('sop_documents').update(patch).eq('id', id);
        data.content_body = fr.content;
        (data as Record<string, unknown>).fetch_as = fr.readAs;
        if (!data.perm_status) (data as Record<string, unknown>).perm_status = 'ok';
      } else {
        const errMsg = sanitizeFeishuMsg(fr.message);
        const patch: Record<string, unknown> = { fetch_error: errMsg };
        if (fr.kind === 'permission') {
          if (!data.perm_status) patch.perm_status = 'pending';
          else if (data.perm_status === 'granted' && !data.content_body) patch.perm_status = 'granted'; // 已授权仍读不到→显式加协作者
        } else if (!data.perm_status) {
          patch.perm_status = 'pending';
        }
        await client.from('sop_documents').update(patch).eq('id', id);
        (data as Record<string, unknown>).fetch_error = errMsg;
        if (patch.perm_status) (data as Record<string, unknown>).perm_status = patch.perm_status;
      }
    }
    // 授权操作权限：提交人本人或 PM/超管（管理权限）
    const canGrant =
      ctx.role === 'PM' ||
      ctx.role === '超管' ||
      (!ctx.isExternal && !!ctx.userId && ctx.userId === (data.uploaded_by as string | null));
    const feishuEnabled = !!data.external_url && data.source_type === 'feishu';
    (data as Record<string, unknown>).canGrant = canGrant;
    (data as Record<string, unknown>).feishuEnabled = feishuEnabled;

    // 文件文档：签发短时签名 URL（仅已确认可见该文档的用户）
    const isFile = data.source_type === 'file' && !!data.file_url;
    if (isFile) {
      try {
        const signed = await sopFileSignedUrl(data.file_url as string, 900);
        (data as Record<string, unknown>).file_signed_url = signed;
      } catch {
        (data as Record<string, unknown>).file_signed_url = null;
      }
    }

    // 图片转 PDF 文档：原图各自签发短时签名 URL（供「查看原图」）
    if (isFile && data.original_file_url) {
      try {
        const keys = JSON.parse(data.original_file_url as string) as string[];
        const mimes = (JSON.parse(String(data.original_mime_type || '[]')) as string[]) || [];
        const urls = await Promise.all(keys.map((k) => sopFileSignedUrl(k, 900)));
        (data as Record<string, unknown>).original_signed_urls = keys.map((k, i) => ({ url: urls[i], mime: mimes[i] }));
      } catch {
        (data as Record<string, unknown>).original_signed_urls = [];
      }
    }

    return NextResponse.json({
      success: true,
      doc: { ...data, synced_count: stats.total, sync_detail: formatSyncDetail(stats), sync_status: syncStatusLabel(data.ai_status as string | null, stats) },
      canUpload: ctx.canUpload,
    });
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
    let contentChanged = false;

    // 触发重新提炼的内容字段：链接 / 分类 / 手动要点 / 正文摘录 / scope
    if (body.scope !== undefined) {
      const scope = String(body.scope);
      if (!SCOPE_OPTIONS.some((s) => s.value === scope)) return NextResponse.json({ error: '一级业务域不合法' }, { status: 400 });
      patch.scope = scope;
      contentChanged = true;
    }
    if (body.sub_category !== undefined) {
      patch.sub_category = String(body.sub_category);
      contentChanged = true;
    }
    if (body.external_url !== undefined) {
      const externalUrl = String(body.external_url).trim();
      if (!/^https?:\/\//i.test(externalUrl)) return NextResponse.json({ error: '链接必须为 http(s) 地址' }, { status: 400 });
      const sourceType = detectSourceType(externalUrl);
      if (sourceType === 'manual') {
        return NextResponse.json({ error: '仅支持飞书(feishu.cn / larksuite.com)或腾讯文档(docs.qq.com)链接' }, { status: 400 });
      }
      patch.external_url = externalUrl;
      patch.source_type = sourceType;
      contentChanged = true;
    }
    if (body.content_excerpt !== undefined) {
      patch.content_excerpt = String(body.content_excerpt).trim() || null;
      contentChanged = true;
    }
    if (body.manual_keypoints !== undefined) {
      patch.ai_keypoints = Array.isArray(body.manual_keypoints) ? (body.manual_keypoints as string[]) : [];
      contentChanged = true;
    }
    // 非内容字段：标题 / 备注 / 需考核，不触发重新提炼
    if (body.title !== undefined && String(body.title).trim()) patch.title = String(body.title).trim();
    if (body.remark !== undefined) patch.remark = String(body.remark).trim();
    if (body.needs_quiz !== undefined) patch.needs_quiz = !!body.needs_quiz;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '无有效更新字段' }, { status: 400 });
    }

    const client = getSupabaseClient();
    if (contentChanged) {
      // 内容变更 → 重置提炼状态并重跑，成功后 version+1
      patch.ai_status = 'processing';
      patch.ai_error = null;
    }
    const { error } = await client.from('sop_documents').update(patch).eq('id', id);
    if (error) throw new Error(`更新失败: ${error.message}`);

    if (contentChanged) {
      const manual = Array.isArray(body.manual_keypoints) ? (body.manual_keypoints as string[]) : [];
      void runSopRefine(id, manual, true);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/sop/documents/[id]  仅 PM / 运营；删除文档并级联清除其已读记录。
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (!ctx.canUpload) {
      return NextResponse.json({ error: '无权限：仅 PM / 运营可删除 SOP 文档' }, { status: 403 });
    }

    const client = getSupabaseClient();
    // 先取 file_url 与 original_file_url，做存储对象清理
    const { data: docRow } = await client
      .from('sop_documents')
      .select('file_url, source_type, original_file_url')
      .eq('id', id)
      .maybeSingle();
    await client.from('sop_read_logs').delete().eq('doc_id', id);
    const { error } = await client.from('sop_documents').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);
    if (docRow?.source_type === 'file') {
      const { deleteSopFile } = await import('@/lib/sop-storage');
      const keys: string[] = [];
      if (docRow.file_url) keys.push(docRow.file_url as string);
      if (docRow.original_file_url) {
        try {
          const parsed = JSON.parse(docRow.original_file_url as string) as string[];
          keys.push(...parsed);
        } catch {
          /* 非 JSON 时忽略（兼容历史） */
        }
      }
      for (const k of keys) {
        try { await deleteSopFile(k); } catch { /* 对象删除失败不影响元数据删除 */ }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}