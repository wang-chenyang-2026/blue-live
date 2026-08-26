import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/**
 * 轻量级 JWT（HS256）实现，使用 Node 内置 crypto，不引入外部依赖。
 * Token payload 包含 userId / phone / role，有效期 7 天。
 */

const COOKIE_NAME = 'blue_live_token';
const SEVEN_DAYS = 7 * 24 * 60 * 60;

// JWT secret 优先从环境变量读取，否则使用一个固定的开发兜底值
function getSecret(): string {
  return process.env.AUTH_TOKEN_SECRET || 'blue-live-dev-secret-change-in-production-2026';
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(input: string): Buffer {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface TokenPayload {
  userId: string;
  phone: string;
  role: string;
  name?: string;
  iat: number;
  exp: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + SEVEN_DAYS,
  };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(full));
  const signature = createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = createHmac('sha256', getSecret())
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(base64urlDecode(body).toString('utf8')) as TokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const AUTH_COOKIE_NAME = COOKIE_NAME;

export function generateCsrfToken(): string {
  return randomBytes(24).toString('hex');
}
