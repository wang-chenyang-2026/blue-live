import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { resolveFeishuUserToken, sanitizeFeishuMsg } from '@/lib/feishu-perm';
import { fetchFeishuDoc } from '@/lib/sop-ai';

/**
 * POST /api/sop/feishu/retry  { document_id }
 * 手动「重新检查」：bot 优先重新抓取在线飞书文档正文并回存；仍读不到则更新待授权状态。
 * 内部可见角色且文档在其可见域内即可触发。
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal || ctx.scopes.length === 0) {
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
      .select('id, title, external_url, source_type, uploaded_by, perm_status')
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

    const { data: submitter } = await client.from('users').select('phone').eq('id', doc.uploaded_by as string).maybeSingle();
    const userToken = resolveFeishuUserToken([ctx.phone, (submitter?.phone as string | undefined) ?? null]);
    const fr = await fetchFeishuDoc(doc.external_url as string, userToken);

    const patch: Record<string, unknown> = {};
    if (fr.ok) {
      patch.content_body = fr.content;
      patch.fetch_as = fr.readAs;
      patch.fetch_error = null;
      if (!doc.perm_status || doc.perm_status === 'pending') patch.perm_status = 'ok';
    } else if (fr.kind === 'permission') {
      patch.fetch_error = sanitizeFeishuMsg(fr.message);
      if (!doc.perm_status) patch.perm_status = 'pending';
      else if (doc.perm_status === 'granted') patch.perm_status = 'granted';
    } else {
      patch.fetch_error = sanitizeFeishuMsg(fr.message);
      if (!doc.perm_status) patch.perm_status = 'pending';
    }
    if (Object.keys(patch).length > 0) {
      await client.from('sop_documents').update(patch).eq('id', documentId);
    }

    return NextResponse.json({
      success: true,
      readable: fr.ok,
      perm_status: (patch.perm_status as string | undefined) ?? doc.perm_status ?? null,
      fetch_error: (patch.fetch_error as string | undefined) ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '检查失败';
    return NextResponse.json({ success: false, code: 'INTERNAL', message: msg }, { status: 500 });
  }
}