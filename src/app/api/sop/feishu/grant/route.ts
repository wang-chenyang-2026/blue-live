import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { authorizePlatformForDoc, getFeishuPlatformMember, resolveFeishuUserToken } from '@/lib/feishu-perm';
import { fetchFeishuDoc } from '@/lib/sop-ai';

/**
 * POST /api/sop/feishu/grant  { document_id }
 * 把平台应用加为该飞书文档的只读协作者（仅单篇、最小 scope）。
 * - 仅提交人本人或 PM/超管可操作，其余 403
 * - 以提交人 user 身份调用，需环境已配置其飞书 user 令牌；缺失时明确报错（绝不伪造成功）
 * - 成功后自动以 bot 优先重试抓取正文并回存
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal || !ctx.userId) {
      return NextResponse.json({ success: false, code: 'FORBIDDEN', message: '无权操作' }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { document_id?: string };
    const documentId = (body.document_id || '').trim();
    if (!documentId) {
      return NextResponse.json({ success: false, code: 'BAD_REQUEST', message: '缺少 document_id' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data: doc, error } = await client
      .from('sop_documents')
      .select('id, title, external_url, source_type, uploaded_by, uploader_name, perm_status, content_body')
      .eq('id', documentId)
      .eq('status', 'published')
      .eq('is_active', true)
      .maybeSingle();
    if (error || !doc) {
      return NextResponse.json({ success: false, code: 'NOT_FOUND', message: '文档不存在或无权访问' }, { status: 404 });
    }
    if (doc.source_type !== 'feishu' || !doc.external_url) {
      return NextResponse.json({ success: false, code: 'NOT_FEISHU', message: '该文档非在线飞书文档' }, { status: 400 });
    }

    // 管理权限：提交人本人或 PM/超管
    const isManager = ctx.role === 'PM' || ctx.role === '超管' || ctx.userId === (doc.uploaded_by as string);
    if (!isManager) {
      return NextResponse.json({ success: false, code: 'FORBIDDEN', message: '仅提交人或管理员可授权' }, { status: 403 });
    }

    // 提交人 user 身份令牌（用于授权+回退读取）
    const { data: submitter } = await client.from('users').select('phone').eq('id', doc.uploaded_by as string).maybeSingle();
    const userToken = resolveFeishuUserToken([ctx.phone, (submitter?.phone as string | undefined) ?? null]);
    if (!userToken || !getFeishuPlatformMember()) {
      return NextResponse.json(
        { success: false, code: 'NEED_CREDENTIALS', message: '平台应用或提交人飞书身份未配置，暂无法一键授权；可先向文档 owner 发起授权申请，完成后点「重新检查」' },
        { status: 409 }
      );
    }

    const granted = await authorizePlatformForDoc(doc.external_url as string, userToken);
    if (!granted.ok) {
      return NextResponse.json({ success: false, code: 'FEISHU_ERROR', message: granted.message }, { status: 502 });
    }

    const now = new Date().toISOString();
    // 授权成功后自动 bot 优先重试抓取
    const fr = await fetchFeishuDoc(doc.external_url as string, userToken);
    const permPatch: Record<string, unknown> = {
      perm_status: 'granted',
      perm_source: (doc.uploader_name as string) || ctx.name || '提交人',
      perm_at: now,
      fetch_error: null,
    };
    if (fr.ok) {
      permPatch.content_body = fr.content;
      permPatch.fetch_as = fr.readAs;
    } else {
      permPatch.fetch_error = (fr.message || '').slice(0, 160);
    }
    await client.from('sop_documents').update(permPatch).eq('id', documentId);

    return NextResponse.json({
      success: true,
      granted: true,
      readable: fr.ok,
      message: granted.message + (fr.ok ? '，正文已更新' : '，正文将在授权生效后自动读取'),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '授权失败';
    return NextResponse.json({ success: false, code: 'INTERNAL', message: msg }, { status: 500 });
  }
}