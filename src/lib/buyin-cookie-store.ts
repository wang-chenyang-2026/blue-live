import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredCookie } from './buyin-session';

/**
 * 百应登录态持久化（M3 补单）。
 * - 扫码登录成功后把 buyin + compass 两套 cookie 落到受限文件（chmod 600），供调度器/执行器
 *   在内存会话 TTL 过期后仍能取数。文件在持久目录 /workspace/projects/data/dy_by/secrets/。
 * - 纪律：cookie 值不提前端可访问目录、不入库、不入 git、不进日志/接口返回；返回只给 account_key。
 */

export const DY_BY_ROOT = process.env.DY_BY_ROOT || '/workspace/projects/data/dy_by';
export const COOKIE_SECRETS_DIR = join(DY_BY_ROOT, 'secrets');

export interface PersistedCookie {
  file: string;
  accountKey: string;
  accountHint: string;
  updateTime: string;
  cookies: Record<string, string>;
}

function ensureSecretsDir(): void {
  if (!existsSync(COOKIE_SECRETS_DIR)) mkdirSync(COOKIE_SECRETS_DIR, { recursive: true });
}

/** 由账号标识派生稳定 key（sha1 前 12 hex）。回报/文件名只出现它，不出 cookie。 */
export function accountKeyFor(hint: string): string {
  return createHash('sha1').update(hint || 'default').digest('hex').slice(0, 12);
}

function cookiesToDict(cookies: StoredCookie[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of cookies) {
    if (c?.name && c.value !== undefined) map[c.name] = c.value;
  }
  return map;
}

/** 落盘某账号的 cookie（覆盖更新）。返回文件与 key，不回 Cookie 内容。 */
export function persistAccountCookies(
  cookies: StoredCookie[],
  hint: string | null,
): { file: string; accountKey: string; accountHint: string } {
  ensureSecretsDir();
  const accountKey = accountKeyFor(hint || '');
  const file = join(COOKIE_SECRETS_DIR, `by_cookies_${accountKey}.json`);
  const payload = {
    platform: 'by',
    update_time: new Date().toISOString(),
    account_key: accountKey,
    account_hint: hint || '',
    cookies: cookiesToDict(cookies),
  };
  writeFileSync(file, JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 });
  chmodSync(file, 0o600);
  return { file, accountKey, accountHint: hint || '' };
}

function readOne(file: string): PersistedCookie | null {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const cookies = (raw.cookies as Record<string, string>) || {};
    return {
      file,
      accountKey: String(raw.account_key || accountKeyFor(String(raw.account_hint || ''))),
      accountHint: String(raw.account_hint || ''),
      updateTime: String(raw.update_time || ''),
      cookies,
    };
  } catch {
    return null;
  }
}

/** 列出所有已持久化账号（只回 key/名称，不回 cookie）。 */
export function listPersistedAccounts(): PersistedCookie[] {
  if (!existsSync(COOKIE_SECRETS_DIR)) return [];
  const out: PersistedCookie[] = [];
  for (const f of readdirSync(COOKIE_SECRETS_DIR)) {
    if (/^by_cookies_.+\.json$/.test(f)) {
      const pc = readOne(join(COOKIE_SECRETS_DIR, f));
      if (pc) out.push(pc);
    }
  }
  return out;
}

/** 按 account_key 精确载入。 */
export function loadPersistedCookies(accountKey: string): PersistedCookie | null {
  if (!existsSync(COOKIE_SECRETS_DIR)) return null;
  const file = join(COOKIE_SECRETS_DIR, `by_cookies_${accountKey}.json`);
  if (!existsSync(file)) return null;
  return readOne(file);
}

/**
 * 按任务的账号标识解析应使用的持久 cookie 文件：
 * 1) 先精确匹配 account_key；2) 再按 account_hint 前缀匹配内容；3) 只有一份则用之。
 * 返回 null 表示没有任何持久登录态可用。
 */
export function resolveCookieFileForAccount(accountHint: string | null): PersistedCookie | null {
  const all = listPersistedAccounts();
  if (!all.length) return null;
  const want = (accountHint || '').trim();
  if (want) {
    const byKey = all.find((p) => p.accountKey === want);
    if (byKey) return byKey;
    const byHint = all.find((p) => p.accountHint && p.accountHint.includes(want.slice(0, 30)));
    if (byHint) return byHint;
  }
  return all.length === 1 ? all[0] : null;
}

const BUYIN_MARKS = ['sessionid', 'ecom_us_lt_buyin'];
const COMPASS_MARKS = ['ecom_us_lt_compass', 'ucas_c0_compass', 'LUOPAN_DT'];

/** 取数所需最小集合：buyin（sessionid/ecom_us_lt_buyin）+ compass（ecom_us_lt_compass）。 */
export function hasCompleteCookies(cookies: Record<string, string>): boolean {
  const c = cookies || {};
  return BUYIN_MARKS.every((k) => !!c[k]) && !!c['ecom_us_lt_compass'];
}

/** 罗盘组覆盖情况（次要：罗盘 cookie 越多越有利于罗盘接口鉴权）。 */
export function compassCoverage(cookies: Record<string, string>): number {
  const c = cookies || {};
  return COMPASS_MARKS.filter((k) => !!c[k]).length;
}

/**
 * 账号 auto-align：以「最近一次成功扫码且 buyin+compass 齐全」的账号为优先。
 * 仅返回完整账号中 update_time 最新者；无任何完整账号则返回 null（不得拿旧的不完整账号硬取数）。
 */
export function preferCompleteAccount(): PersistedCookie | null {
  const complete = listPersistedAccounts().filter((p) => hasCompleteCookies(p.cookies));
  if (!complete.length) return null;
  return complete.sort((a, b) => (a.updateTime < b.updateTime ? 1 : -1))[0];
}