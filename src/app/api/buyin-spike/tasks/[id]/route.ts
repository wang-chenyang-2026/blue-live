import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getSopUserContext } from '@/lib/sop-context';
import { cleanTaskBody } from '@/lib/buyin-task-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_SELECT = [
  'id', 'name', 'by_kol_id', 'by_account', 'granularities', 'selected_fields',
  'with_product_detail', 'lookback_days', 'frequency', 'interval_days', 'interval_value', 'weekday', 'run_time',
  'delivery_target_type', 'delivery_feishu_token', 'delivery_feishu_url',
  'delivery_auto_create', 'delivery_sheet_created', 'one_sheet_per_type', 'write_mode',
  'enabled', 'created_by', 'creator_name', 'created_at', 'updated_at',
].join(',');

// PATCH /api/buyin-spike/tasks/[id] —— 更新（含启用/停用、编辑回显）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });

    const body = await request.json().catch(() => ({}));

    // 仅启停
    if (body.toggle_enabled === true) {
      const { data, error } = await getSupabaseClient()
        .from('buyin_tasks')
        .update({ enabled: Boolean(body.enabled), updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(LIST_SELECT)
        .single();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, task: data });
    }

    const { granularities, selected_fields, name, errs, data } = cleanTaskBody({ ...body, update_only: true });
    if (errs.length) return NextResponse.json({ success: false, error: errs.join('；') }, { status: 400 });

    const { data: updated, error } = await getSupabaseClient()
      .from('buyin_tasks')
      .update({ ...data, name, granularities, selected_fields, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(LIST_SELECT)
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ success: false, error: '任务不存在' }, { status: 404 });
    return NextResponse.json({ success: true, task: updated });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// DELETE /api/buyin-spike/tasks/[id] —— 删除（仅删该任务记录）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });

    const { error } = await getSupabaseClient().from('buyin_tasks').delete().eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}