import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, verifyPassword } from '@/lib/password';

const ADMIN_PHONE = '18333685049';
const ADMIN_PASSWORD = 'wcy861937877';

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
      // 自动创建管理员账号（手机号 18333685049）
      if (phone === ADMIN_PHONE && password === ADMIN_PASSWORD) {
        const { data: newUser, error: insertError } = await client
          .from('users')
          .insert({
            name: '王晨阳',
            phone: ADMIN_PHONE,
            password_hash: hashPassword(ADMIN_PASSWORD),
            role: 'PM',
            brand: 'all',
            status: 'approved',
            remark: '系统管理员',
          })
          .select('id, name, phone, password_hash, role, brand, status, remark, created_at')
          .single();
        if (insertError) throw new Error(`创建管理员失败: ${insertError.message}`);
        const safeUser = {
          id: newUser.id,
          name: newUser.name,
          phone: newUser.phone,
          role: newUser.role,
          projectScope: newUser.brand || '',
          status: newUser.status,
          remark: newUser.remark || '',
          createdAt: (newUser.created_at || '').slice(0, 10),
        };
        return NextResponse.json({ success: true, user: safeUser });
      }
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

    if (u.status !== 'approved') {
      return NextResponse.json({ error: '您没有登录权限，可与管理员联系', status: u.status }, { status: 403 });
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
