import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';

// POST /api/sop/documents/[id]/read
// 记录当前用户已读该文档（幂等：unique(doc_id, user_id)）。
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: '未获取到用户身份' }, { status: 401 });
    }
    if (ctx.isExternal) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }

    const client = getSupabaseClient();
    const { error } = await client.from('sop_read_logs').upsert(
      { doc_id: id, user_id: ctx.userId, read_at: new Date().toISOString() },
      { onConflict: 'doc_id,user_id' }
    );
    if (error) throw new Error(`写入已读失败: ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}