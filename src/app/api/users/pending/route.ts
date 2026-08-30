import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireSuperAdmin } from '@/lib/api-permission';

/**
 * GET /api/users/pending
 * 查询所有待审核用户（status='pending'）
 * 别名路由，等价于 GET /api/users?status=pending
 * 仅超级管理员可访问
 */
export async function GET(request: NextRequest) {
  const forbidden = requireSuperAdmin(request);
  if (forbidden) return forbidden;
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .select('id, name, phone, role, brand, status, remark, created_at, updated_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1000);

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
