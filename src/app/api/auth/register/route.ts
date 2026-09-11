import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hashPassword } from '@/lib/password';
import { notifyNewRegistration } from '@/lib/feishu-notify';

interface RegisterBody {
  name?: string;
  phone?: string;
  password?: string;
  projectScope?: string;
  role?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RegisterBody;
    const name = (body.name || '').trim();
    const phone = (body.phone || '').trim();
    const password = body.password || '';
    const projectScope = (body.projectScope || '').trim();
    const role = (body.role || 'anchor').trim();

    if (!name) return NextResponse.json({ error: '请输入姓名' }, { status: 400 });
    if (!phone || phone.length !== 11) return NextResponse.json({ error: '请输入11位手机号' }, { status: 400 });
    if (!password || password.length < 8) return NextResponse.json({ error: '密码不少于8位字符' }, { status: 400 });
    if (!projectScope) return NextResponse.json({ error: '请选择项目' }, { status: 400 });
    if (!role) return NextResponse.json({ error: '请选择岗位' }, { status: 400 });

    const client = getSupabaseClient();

    // 检查手机号是否已注册
    const { data: existing, error: findError } = await client
      .from('users')
      .select('id, status')
      .eq('phone', phone)
      .maybeSingle();
    if (findError) throw new Error(`查询失败: ${findError.message}`);

    if (existing) {
      const s = (existing as { status: string }).status;
      if (s === 'pending') return NextResponse.json({ error: '该手机号已注册，等待审核中' }, { status: 409 });
      if (s === 'approved') return NextResponse.json({ error: '该手机号已注册，请直接登录' }, { status: 409 });

      // 被拒绝（rejected）的手机号：允许重新提交注册申请。
      // 更新原账号资料并把状态重置为 pending，重新进入审批流程，不产生重复账号。
      if (s === 'rejected') {
        const reapplyHash = hashPassword(password);
        const { data: reapplied, error: updateError } = await client
          .from('users')
          .update({
            name,
            password_hash: reapplyHash,
            role,
            brand: projectScope,
            status: 'pending',
            remark: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as { id: string }).id)
          .select('id, name, phone, role, brand, status, created_at')
          .single();
        if (updateError) throw new Error(`重新提交失败: ${updateError.message}`);

        // 重新提交也通知管理员审批
        notifyNewRegistration({
          name: (reapplied as any)?.name || name,
          phone: (reapplied as any)?.phone || phone,
          role: (reapplied as any)?.role || role,
          brand: (reapplied as any)?.brand || projectScope,
        }).catch(() => {});

        return NextResponse.json({ success: true, user: reapplied, reapplied: true });
      }

      // terminated（已停用）等其他状态：不允许自助注册
      return NextResponse.json({ error: '该账号状态异常，请联系管理员' }, { status: 409 });
    }

    const password_hash = hashPassword(password);
    const { data: inserted, error: insertError } = await client
      .from('users')
      .insert({
        name,
        phone,
        password_hash,
        role,
        brand: projectScope,
        status: 'pending',
      })
      .select('id, name, phone, role, brand, status, created_at')
      .single();
    if (insertError) throw new Error(`注册失败: ${insertError.message}`);

    // 异步通知管理员（不阻塞注册响应）
    notifyNewRegistration({
      name: (inserted as any).name || name,
      phone: (inserted as any).phone || phone,
      role: (inserted as any).role || role,
      brand: (inserted as any).brand || projectScope,
    }).catch(() => {});

    return NextResponse.json({ success: true, user: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
