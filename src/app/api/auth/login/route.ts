import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { verifyPassword } from '@/lib/password';

interface LoginBody {
  phone?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LoginBody;
    const phone = (body.phone || '').trim();
    const password = body.password || '';

    if (!phone) return NextResponse.json({ error: '请输入手机号' }, { status: 400 });
    if (!password) return NextResponse.json({ error: '请输入密码' }, { status: 400 });

    const client = getSupabaseClient();

    const { data: user, error } = await client
      .from('users')
      .select('id, name, phone, password_hash, role, brand, status, remark, created_at')
      .eq('phone', phone)
      .maybeSingle();
    if (error) throw new Error(`查询失败: ${error.message}`);

    if (!user) {
      return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 });
    }

    const u = user as {
      id: string;
      name: string;
      phone: string;
      password_hash: string;
      role: string;
      brand: string | null;
      status: string;
      remark: string | null;
      created_at: string;
    };

    if (u.status === 'pending') {
      return NextResponse.json({ error: '账号待审核，请等待项目负责人审批', status: 'pending' }, { status: 403 });
    }
    if (u.status === 'rejected') {
      return NextResponse.json({ error: '账号已被拒绝，请联系管理员', status: 'rejected' }, { status: 403 });
    }
    if (u.status === 'terminated') {
      return NextResponse.json({ error: '账号已停止合作，如有疑问请联系项目负责人', status: 'terminated' }, { status: 403 });
    }
    if (u.status !== 'approved') {
      return NextResponse.json({ error: '账号状态异常' }, { status: 403 });
    }

    if (!verifyPassword(password, u.password_hash)) {
      return NextResponse.json({ error: '手机号或密码错误' }, { status: 401 });
    }

    // 移除敏感字段
    const safeUser = {
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      projectScope: u.brand || '',
      status: u.status,
      remark: u.remark || '',
      createdAt: (u.created_at || '').slice(0, 10),
    };
    return NextResponse.json({ success: true, user: safeUser });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
