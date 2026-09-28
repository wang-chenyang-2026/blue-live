import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAFE_SELECT = [
  'id', 'task_id', 'account_hint', 'stat_date', 'data_type', 'dim_key',
  'live_room_id', 'row_json', 'crawl_status', 'state_desc', 'created_at', 'updated_at',
].join(',');

function dateOrNull(v: string | null): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// GET /api/buyin-spike/tasks/[id]/data —— 某任务在日期区间内的数据（便于任务详情展示）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });

    const sp = request.nextUrl.searchParams;
    const dataType = sp.get('dataType');
    const startDate = dateOrNull(sp.get('startDate') || sp.get('start'));
    const endDate = dateOrNull(sp.get('endDate') || sp.get('end'));

    let q = getSupabaseClient().from('buyin_data').select(SAFE_SELECT).eq('task_id', id);
    if (dataType) q = q.eq('data_type', dataType);
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