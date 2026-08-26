import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';

export async function POST() {
  const resp = NextResponse.json({ success: true });
  resp.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return resp;
}
