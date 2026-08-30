import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireSuperAdmin } from '@/lib/api-permission';

/**
 * GET /api/users?status=pending  查询待审核用户（仅超级管理员）
 * GET /api/users                 查询全部用户
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // 待审核用户列表仅超级管理员可查询
    if (status === 'pending') {
      const forbidden = requireSuperAdmin(request);
      if (forbidden) return forbidden;
    }

    const client = getSupabaseClient();
    let query = client
      .from('users')
      .select('id, name, phone, role, brand, status, remark, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(`查询失败: ${error.message}`);

    const users = (data || []).map((u) => {
      const row = u as {
        id: string;
        name: string;
        phone: string;
        role: string;
        brand: string | null;
        status: string;
        remark: string | null;
        created_at: string;
      };
      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        role: row.role,
        projectScope: row.brand || '',
        status: row.status,
        remark: row.remark || '',
        createdAt: (row.created_at || '').slice(0, 10),
      };
    });
    return NextResponse.json({ success: true, users });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
