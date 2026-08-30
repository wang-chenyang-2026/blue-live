import { NextRequest, NextResponse } from 'next/server';
import { SUPER_ADMIN_PHONE } from '@/lib/constants';

/**
 * 从请求头读取登录用户手机号（由 middleware 注入，已鉴权）。
 */
export function getRequestPhone(request: NextRequest): string | null {
  return request.headers.get('x-user-phone');
}

/**
 * 校验当前登录用户是否为超级管理员（仅王晨阳本人）。
 * 用于「用户审批」等专属接口的服务端权限控制。
 * 非超级管理员返回 403 响应；通过时返回 null。
 */
export function requireSuperAdmin(request: NextRequest): NextResponse | null {
  const phone = getRequestPhone(request);
  if (phone !== SUPER_ADMIN_PHONE) {
    return NextResponse.json(
      { error: '无权限：仅超级管理员可操作用户审批' },
      { status: 403 }
    );
  }
  return null;
}
