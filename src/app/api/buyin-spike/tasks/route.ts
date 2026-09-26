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

// GET /api/buyin-spike/tasks —— 列表
export async function GET(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    const { data, error } = await getSupabaseClient()
      .from('buyin_tasks')
      .select(LIST_SELECT)
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, tasks: data ?? [] });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}

// POST /api/buyin-spike/tasks —— 新建
export async function POST(request: NextRequest) {
  try {
    const ctx = await getSopUserContext(request);
    if (ctx.isExternal) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const { granularities, selected_fields, name, errs, data } = cleanTaskBody(body);
    if (errs.length) return NextResponse.json({ success: false, error: errs.join('；') }, { status: 400 });

    const { data: inserted, error } = await getSupabaseClient()
      .from('buyin_tasks')
      .insert({
        ...data,
        name,
        granularities,
        selected_fields,
        created_by: ctx.userId ?? undefined,
        creator_name: ctx.name || null,
      })
      .select(LIST_SELECT)
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, task: inserted });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}