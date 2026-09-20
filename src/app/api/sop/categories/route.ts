import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/sop/categories   分类/岗位/品牌字典（纯枚举，任何已登录角色可读，用于筛选下拉）
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('sop_categories')
      .select('id, type, label, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`查询失败: ${error.message}`);

    return NextResponse.json({ success: true, categories: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}