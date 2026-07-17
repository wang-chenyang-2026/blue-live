import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

interface UpdateBody {
  status?: 'pending' | 'approved' | 'rejected' | 'terminated';
  remark?: string;
  role?: string;
  brand?: string;
  projectScope?: string;
  name?: string;
  phone?: string;
}

/**
 * PUT /api/users/[id]  更新用户（审批通过/拒绝/修改角色等）
 * DELETE /api/users/[id]  删除用户
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

    const body = (await request.json()) as UpdateBody;
    const updates: Record<string, string> = {};

    if (body.status) {
      if (!['pending', 'approved', 'rejected', 'terminated'].includes(body.status)) {
        return NextResponse.json({ error: '非法状态值' }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (typeof body.remark === 'string') updates.remark = body.remark;
    if (body.role) updates.role = body.role;
    // brand 或 projectScope 都可以（兼容前端字段名）
    const brand = body.brand ?? body.projectScope;
    if (typeof brand === 'string') updates.brand = brand;
    if (body.name) updates.name = body.name;
    if (typeof body.phone === 'string' && body.phone.trim()) {
      const phone = body.phone.trim();
      if (!/^1\d{10}$/.test(phone)) {
        return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
      }
      // 检查手机号唯一性（排除自己）
      const client0 = getSupabaseClient();
      const { data: dup } = await client0
        .from('users')
        .select('id')
        .eq('phone', phone)
        .neq('id', id)
        .maybeSingle();
      if (dup) {
        return NextResponse.json({ error: '手机号已被其他用户使用' }, { status: 409 });
      }
      updates.phone = phone;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '无更新字段' }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, name, phone, role, brand, status, remark, created_at')
      .maybeSingle();
    if (error) throw new Error(`更新失败: ${error.message}`);
    if (!data) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

    // 字段映射 brand → projectScope
    const user = {
      id: data.id,
      name: data.name,
      phone: data.phone,
      role: data.role,
      projectScope: data.brand,
      status: data.status,
      remark: data.remark ?? '',
      createdAt: data.created_at,
    };
    return NextResponse.json({ success: true, user });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

    const client = getSupabaseClient();
    const { error } = await client.from('users').delete().eq('id', id);
    if (error) throw new Error(`删除失败: ${error.message}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
