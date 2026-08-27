import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, AUTH_COOKIE_NAME } from '@/lib/auth-token';

// 无需鉴权即可访问的 API 路径前缀
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 只保护 /api/ 路径
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 公开接口放行
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 从 cookie 或 Authorization header 读取 token
  const cookieToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const authHeader = request.headers.get('authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = cookieToken || bearerToken;

  if (!token) {
    return NextResponse.json(
      { success: false, error: '未登录，请先登录', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { success: false, error: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' },
      { status: 401 }
    );
  }

  // 将用户信息注入请求头，供下游 API 路由使用
  // 注意：HTTP header 只支持 ASCII，中文需要 URL 编码
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-phone', payload.phone);
  requestHeaders.set('x-user-role', encodeURIComponent(payload.role));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // 只在 API 路由上运行 middleware
  matcher: ['/api/:path*'],
};

export const runtime = 'nodejs';
