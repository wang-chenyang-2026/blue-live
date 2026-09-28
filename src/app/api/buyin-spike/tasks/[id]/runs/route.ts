import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 仅返回非敏感必要字段（不回 cookie/签名）
const SAFE_SELECT = [
  'id', 'task_id', 'account_hint', 'trigger_type', 'stat_dates', 'granularities',
  'status', 'row_count', 'request_count', 'error_summary', 'started_at', 'finished_at',
].join(',');

// GET /api/buyin-spike/tasks/[id]/runs —— 某任务的最近运行记录
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    const { data, error } = await getSupabaseClient()
      .from('buyin_run_logs')
      .select(SAFE_SELECT)
      .eq('task_id', id)
      .order('started_at', { ascending: false })
      .limit(20);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, runs: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}