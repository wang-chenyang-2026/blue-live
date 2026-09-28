import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { runTask, type BuyinRuntimeTask } from '@/lib/buyin-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TASK_SELECT = [
  'id', 'name', 'by_kol_id', 'by_account', 'granularities', 'selected_fields',
  'with_product_detail', 'lookback_days', 'frequency', 'interval_value', 'interval_days', 'weekday', 'run_time', 'enabled',
].join(',');

function isPmOperation(role: string): boolean {
  if (!role) return false;
  const r = role.trim();
  return r === 'PM' || r.includes('PM') || r === '运营' || r.includes('运营') || r === '超级管理员' || r.includes('超管');
}

// POST /api/buyin-spike/tasks/[id]/run —— 手动立即执行（登录 + PM/运营，401/403）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);

    if (!ctx.userId && !ctx.name) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    if (ctx.isExternal || !isPmOperation(ctx.role))
      return NextResponse.json({ success: false, error: '无权限：仅 PM/运营可手动执行' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const statDate = typeof body.statDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.statDate) ? body.statDate : undefined;

    const { data: raw, error } = await getSupabaseClient().from('buyin_tasks').select(TASK_SELECT).eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    const row = raw as unknown as {
      id: string;
      by_kol_id: string | null;
      by_account: string | null;
      granularities: string[];
      selected_fields: string[];
      with_product_detail: boolean;
      lookback_days: number;
      frequency: string;
      interval_value: number | null;
      interval_days: number | null;
      weekday: number | null;
      run_time: string | null;
      enabled: boolean;
    } | null;
    if (!row) return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 });

    const task: BuyinRuntimeTask = {
      id: row.id,
      by_kol_id: row.by_kol_id,
      by_account: row.by_account,
      granularities: row.granularities,
      selected_fields: row.selected_fields,
      with_product_detail: row.with_product_detail,
      lookback_days: row.lookback_days,
      frequency: row.frequency,
      interval: row.interval_value ?? row.interval_days,
      weekday: row.weekday,
      run_time: row.run_time,
      enabled: row.enabled,
    };

    const outcome = await runTask(task, { triggerType: 'manual', creatorId: ctx.userId || null, statDate, skipIfSuccess: false });

    return NextResponse.json({
      success: true,
      run: {
        id: outcome.runId,
        status: outcome.status,
        statDates: outcome.statDates,
        rowCount: outcome.rowCount,
        requestCount: outcome.requestCount,
        errorSummary: outcome.errorSummary,
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}