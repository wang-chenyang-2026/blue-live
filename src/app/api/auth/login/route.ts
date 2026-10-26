import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword, verifyPassword } from '@/lib/password';
import { signToken, AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { INTERNAL_SHARE_ROLE } from '@/lib/constants';
import {
  SUPER_ADMIN_PHONE,
  INTERNAL_SHARE_PHONE,
  INTERNAL_SHARE_NOTIFY_TARGET_PHONE,
} from '@/lib/server/internal-share';
import { insertNotification } from '@/lib/notify';

const ADMIN_PHONE = SUPER_ADMIN_PHONE;
const ADMIN_PASSWORD = 'wcy861937877';

/** 内部分享账号登录成功后的站内通知（仅该账号触发，防止刷屏）。 */
function notifyInternalShareLogin(request: NextRequest, name: string) {
  const now = new Date();
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(
    now.getSeconds()
  ).padStart(2, '0')}`;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '';
  const ipSeg = ip ? ` · IP ${ip}` : '';
  insertNotification({
    targetPhone: INTERNAL_SHARE_NOTIFY_TARGET_PHONE,
    kind: 'internal_share_login',
    title: '内部分享账号登录提醒',
    content: `内部分享账号${name ? `（${name}）` : ''}已于 ${timeStr} 登录${ipSeg}`,
  }).catch(() => {});
}

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
          isSuperAdmin: newUser.phone === SUPER_ADMIN_PHONE,
        };
        const token = signToken({
          userId: newUser.id,
          phone: newUser.phone,
          role: newUser.role,
          name: newUser.name,
        });
        const resp = NextResponse.json({ success: true, user: safeUser });
        resp.cookies.set(AUTH_COOKIE_NAME, token, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
        return resp;
      }

      // 自动创建内部分享账号（手机号/密码均 29898110261），开箱即用、无需注册
      if (phone === INTERNAL_SHARE_PHONE && password === INTERNAL_SHARE_PHONE) {
        const { data: newUser, error: insertError } = await client
          .from('users')
          .insert({
            name: '内部分享',
            phone: INTERNAL_SHARE_PHONE,
            password_hash: hashPassword(INTERNAL_SHARE_PHONE),
            role: INTERNAL_SHARE_ROLE,
            brand: 'all',
            status: 'approved',
            remark: '内部分享（交流学习）',
          })
          .select('id, name, phone, password_hash, role, brand, status, remark, created_at')
          .single();
        if (insertError) throw new Error(`创建内部分享账号失败: ${insertError.message}`);
        notifyInternalShareLogin(request, newUser.name);
        const safeUser = {
          id: newUser.id,
          name: newUser.name,
          phone: newUser.phone,
          role: newUser.role,
          projectScope: newUser.brand || '',
          status: newUser.status,
          remark: newUser.remark || '',
          createdAt: (newUser.created_at || '').slice(0, 10),
          isSuperAdmin: newUser.phone === SUPER_ADMIN_PHONE,
        };
        const token = signToken({
          userId: newUser.id,
          phone: newUser.phone,
          role: newUser.role,
          name: newUser.name,
        });
        const resp = NextResponse.json({ success: true, user: safeUser });
        resp.cookies.set(AUTH_COOKIE_NAME, token, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 7 * 24 * 60 * 60,
        });
        return resp;
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
      isSuperAdmin: u.phone === SUPER_ADMIN_PHONE,
    };
    const token = signToken({
      userId: u.id,
      phone: u.phone,
      role: u.role,
      name: u.name,
    });
    // 内部分享账号每次成功登录，向管理员发送登录通知（仅该账号触发）
    if (u.phone === INTERNAL_SHARE_PHONE) notifyInternalShareLogin(request, u.name);
    const resp = NextResponse.json({ success: true, user: safeUser });
    resp.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
    return resp;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
