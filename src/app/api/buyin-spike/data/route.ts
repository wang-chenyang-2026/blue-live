import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_SELECT = [
  'id', 'task_id', 'account_hint', 'stat_date', 'data_type', 'dim_key',
  'live_room_id', 'row_json', 'crawl_status', 'state_desc', 'created_at', 'updated_at',
].join(',');

// 校验 YYYY-MM-DD，非法返回 null
function dateOrNull(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// GET /api/buyin-spike/data —— 参数查询百应取数结果（不返回任何 cookie/签名字段）
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });

    const sp = request.nextUrl.searchParams;
    const taskId = sp.get('taskId');
    const dataType = sp.get('dataType');
    const accountHint = sp.get('accountHint');
    const startDate = dateOrNull(sp.get('startDate') || sp.get('start'));
    const endDate = dateOrNull(sp.get('endDate') || sp.get('end'));

    let q = getSupabaseClient().from('buyin_data').select(SAFE_SELECT);
    if (taskId) q = q.eq('task_id', taskId);
    if (dataType) q = q.eq('data_type', dataType);
    if (accountHint) q = q.eq('account_hint', accountHint);
    if (startDate) q = q.gte('stat_date', startDate);
    if (endDate) q = q.lte('stat_date', endDate);
    q = q.order('stat_date', { ascending: true }).order('data_type', { ascending: true }).order('dim_key', { ascending: true }).limit(2000);

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, rows: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}