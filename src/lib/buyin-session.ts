import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { persistAccountCookies } from './buyin-cookie-store';

export const SESSION_TTL = 5 * 60 * 1000;

const LOGIN_URL = 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24';
const COMPASS_URL = 'https://compass.jinritemai.com/';
// 罗盘视角业务页（buyin 直播明细 + 罗盘直播复盘）：真实登录会话里打开会触发
// /compass_api/author/** 鉴权并回填 ecom_us_lt_compass / ucas_c0_compass / LUOPAN_DT 这组 cookie
const BUYIN_COMPASS_LIVE_LIST = 'https://buyin.jinritemai.com/dashboard/compass-home/live-list';
const COMPASS_STATEMENT = 'https://compass.jinritemai.com/talent/live-statement';
const COMPASS_COOKIE_MARKS = ['ecom_us_lt_compass', 'ucas_c0_compass', 'LUOPAN_DT'];

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
  '--no-zygote',
];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
}

export interface BuyinSession {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  expiresAt: number;
  status: 'starting' | 'waiting_scan' | 'logged_in' | 'expired';
  accountHint: string | null;
  cookieCount: number;
  cookie: StoredCookie[] | null;
  error: string | null;
  timer: NodeJS.Timeout | null;
}

const sessions = new Map<string, BuyinSession>();

function randomId(): string {
  return `bysn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function sessionLoginDetected(url: string | null): boolean {
  if (!url) return false;
  if (url.includes('douyinec.com')) return false;
  if (url.includes('/mpa/account/login') || url.includes('/login')) return false;
  return url.includes('buyin.jinritemai.com');
}

async function captureLoginQr(page: Page): Promise<{ shot: Buffer; shotMode: string }> {
  // 等待 open.douyin.com/qrconnect 二维码 iframe 稳定存在（≥1.5s 内不消失）
  let lastSeen = 0;
  let stable = false;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const f = page.frames().find((x) => x.url().includes('open.douyin.com/qrconnect'));
    if (f) {
      if (!lastSeen) lastSeen = Date.now();
      else if (Date.now() - lastSeen > 1500) {
        stable = true;
        break;
      }
    } else {
      lastSeen = 0;
    }
    await page.waitForTimeout(400);
  }
  if (!stable) {
    throw new Error('open.douyin.com/qrconnect 二维码 iframe 未出现或未稳定（可能被风控/未渲染）');
  }

  let shot: Buffer | null = null;
  let shotMode = 'none';
  for (let i = 0; i < 8 && !shot; i++) {
    const f = page.frames().find((x) => x.url().includes('open.douyin.com/qrconnect'));
    if (!f) continue;
    try {
      await f.waitForTimeout(1200);
      const info = await f.evaluate(() =>
        Array.from(document.querySelectorAll('img')).map((im) => ({
          src: (im as HTMLImageElement).src.slice(0, 200),
          w: Math.round((im as HTMLElement).getBoundingClientRect().width),
          h: Math.round((im as HTMLElement).getBoundingClientRect().height),
          alt: (im as HTMLImageElement).alt,
          nw: (im as HTMLImageElement).naturalWidth,
          nh: (im as HTMLImageElement).naturalHeight,
        })),
      );
      let idx = -1;
      for (let k = 0; k < info.length; k++) {
        const x = info[k];
        const isSvg = x.src.includes('svg+xml');
        const big = (x.nw >= 150 && x.nh >= 150) || (x.w >= 150 && x.h >= 150);
        if (!isSvg && big) {
          idx = k;
          break;
        }
      }
      if (idx < 0) {
        for (let k = 0; k < info.length; k++) {
          if (!info[k].src.includes('svg+xml')) {
            idx = k;
            break;
          }
        }
      }
      if (idx >= 0) {
        const els = await f.$$('img');
        if (els[idx]) {
          const buf = await els[idx].screenshot().catch(() => null);
          if (buf && buf.length > 200) {
            shot = buf;
            shotMode = info[idx].src.includes('get_qrcode') ? 'qr-img(get_qrcode)' : 'qr-img';
          }
        }
      }
    } catch {
      /* 帧可能被页面重挂载，容忍并重试 */
    }
    if (!shot) await page.waitForTimeout(1000);
  }

  return { shot: shot ?? Buffer.alloc(0), shotMode };
}

async function extractCookie(session: BuyinSession): Promise<void> {
  // 已登录后从会话上下文提取目标 host 的 cookie（安全存储，不回显值）
  try {
    const buyinCookies = await session.context.cookies(['https://buyin.jinritemai.com']);
    const compassCookies = await session.context.cookies(['https://compass.jinritemai.com']);
    // buyin 在前、compass 在后：同名以 compass 为准（对齐 skill cookies.update(compass_cookies)）
    const safe = [...buyinCookies, ...compassCookies].map((c) => ({ name: c.name, value: c.value, domain: c.domain }));
    session.cookie = safe;
    session.cookieCount = safe.length;
    const hit = safe.find((c) => /(^|_)(uid|user|account|name|nick)(_|$)/i.test(c.name));
    session.accountHint = hit ? hit.value.slice(0, 40) : null;
  } catch {
    session.cookieCount = 0;
  }
}

/**
 * 在已登录（同一下文）后补齐电商罗盘 cookie。buyin 已登录时罗盘会复用同 sessionid 自动 SSO，不需二次扫码。
 * 实战验证：仅开罗盘首页不会 set ecom_us_lt_compass 组，必须导航进罗盘商务模块（buyin 直播明细 / 罗盘直播复盘）
 * 触发 /compass_api/author/** 鉴权才会回填。此处依序打开多个模块并轮询，任一回填即成功。
 */
async function ensureCompassCookies(session: BuyinSession): Promise<void> {
  let compassPage: Page | null = null;
  const deadline = Date.now() + 45000;
  const gotCompass = async (): Promise<boolean> => {
    const c = await session.context.cookies(['https://compass.jinritemai.com']);
    return c.some((x) => COMPASS_COOKIE_MARKS.includes(x.name));
  };
  try {
    // 给刚完成的 buyin 登录一小段沉降，避免罗盘导航过早、SSO 未就绪
    await new Promise((r) => setTimeout(r, 2000));
    compassPage = await session.context.newPage();
    const urls = [COMPASS_URL, BUYIN_COMPASS_LIVE_LIST, COMPASS_STATEMENT, COMPASS_URL];
    for (const u of urls) {
      if (await gotCompass()) break;
      await compassPage.goto(u, { waitUntil: 'load', timeout: 25000 }).catch(() => undefined);
    }
    while (Date.now() < deadline) {
      if (await gotCompass()) break;
      await compassPage.waitForTimeout(1500);
    }
  } catch {
    /* 拿不到 compass cookie 不抛——extractCookie 仍会保存文档状态，门控会如实判不完整 */
  } finally {
    if (compassPage) await compassPage.close().catch(() => undefined);
  }
}

function disposeSession(session: BuyinSession): void {
  if (session.timer) clearTimeout(session.timer);
  session.timer = null;
  session.status = 'expired';
  void session.browser.close().catch(() => undefined);
  if (sessions.get(session.sessionId) === session) sessions.delete(session.sessionId);
}

function scheduleExpiry(session: BuyinSession, ttlMs: number): void {
  session.timer = setTimeout(() => {
    if (session.status !== 'logged_in') disposeSession(session);
  }, ttlMs);
  session.timer.unref?.();
}

/**
 * 启动一次常驻扫码会话：拉起无头浏览器→开百应登录页→取二维码，浏览器保持不关。
 * 已存在会话会先关闭（避免堆积/旧二维码被占用）。
 */
export async function startSession(
  opts: { ttlMs?: number } = {},
): Promise<{ sessionId: string; image: string; shotMode: string; status: string }> {
  const ttlMs = opts.ttlMs ?? readEnvTtl();
  for (const s of Array.from(sessions.values())) disposeSession(s);

  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    userAgent: UA,
    extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const resp = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (resp && resp.status() >= 400) {
    await browser.close().catch(() => undefined);
    throw new Error(`百应登录页加载失败，HTTP ${resp.status()}`);
  }

  const { shot, shotMode } = await captureLoginQr(page);
  if (!shot || shot.length === 0) {
    await browser.close().catch(() => undefined);
    throw new Error('未取到二维码（含整页兜底失败）；二维码接口可能被风控拦截');
  }

  const sessionId = randomId();
  const now = Date.now();
  const session: BuyinSession = {
    sessionId,
    browser,
    context,
    page,
    createdAt: now,
    expiresAt: now + ttlMs,
    status: 'waiting_scan',
    accountHint: null,
    cookieCount: 0,
    cookie: null,
    error: null,
    timer: null,
  };
  sessions.set(sessionId, session);
  scheduleExpiry(session, ttlMs);

  return { sessionId, image: `data:image/png;base64,${shot.toString('base64')}`, shotMode, status: 'waiting_scan' };
}

function readEnvTtl(): number {
  const v = Number(process.env.BUYIN_SESSION_TTL_MS);
  return Number.isFinite(v) && v > 0 ? v : SESSION_TTL;
}

/**
 * 检查会话登录状态。前端每 2~3s 轮询。
 * - 登录页：status=waiting_scan
 * - 已跳转百应业务路径：提取 cookie、ref = logged_in
 * - 会话不存在/已过期：not_found / expired
 */
export async function getSessionStatus(sessionId: string): Promise<{
  status: string;
  accountHint?: string | null;
  cookieCount?: number;
  ok?: boolean;
}> {
  const session = sessions.get(sessionId);
  if (!session) return { status: 'not_found' };

  if (session.status === 'expired') {
    disposeSession(session);
    return { status: 'expired' };
  }

  if (session.status === 'logged_in') {
    return { ok: true, status: 'logged_in', accountHint: session.accountHint, cookieCount: session.cookieCount };
  }

  const url = session.page.url();
  if (session.status === 'waiting_scan' && sessionLoginDetected(url)) {
    const next = await attemptLoginFinalize(session);
    if (next === 'logged_in') {
      return { ok: true, status: 'logged_in', accountHint: session.accountHint, cookieCount: session.cookieCount };
    }
  }

  return { status: 'waiting_scan' };
}

async function attemptLoginFinalize(session: BuyinSession): Promise<'logged_in' | 'waiting_scan'> {
  session.status = 'starting';
  try {
    // 先导航 compass 首页复用登录会话，等 compass 域 cookie 写齐（含 ecom_us_lt_compass 等）
    await ensureCompassCookies(session);
    await extractCookie(session);
    session.status = 'logged_in';
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    // 持久化到受限文件（供调度器/执行器在内存会话过期后仍能取数）
    if (session.cookie && session.cookie.length) {
      try {
        persistAccountCookies(session.cookie, session.accountHint);
      } catch {
        // 持久化失败不阻断登录成功，仅影响后续自动调度取数
      }
    }
  } catch (e) {
    session.status = 'waiting_scan';
    session.error = e instanceof Error ? e.message : String(e);
  }
  return session.status;
}

/** 主动关闭并清理指定会话。 */
export async function cancelSession(sessionId: string): Promise<{ ok: boolean; status: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, status: 'not_found' };
  disposeSession(session);
  return { ok: true, status: 'cancelled' };
}

/** 关闭全部会话并返回被清理数量（用于进程退出/汇总）。 */
export async function closeAllSessions(): Promise<number> {
  const n = sessions.size;
  for (const s of Array.from(sessions.values())) disposeSession(s);
  return n;
}

/** 仅供进程内自检/测试访问会话对象。 */
export function getSession(sessionId: string): BuyinSession | undefined {
  return sessions.get(sessionId);
}

export function liveSessions(): number {
  return sessions.size;
}

/** 返回进程内所有已登录会话的登录态（仅供同进程执行器使用，不与外部交互、不回落盘）。 */
export function liveCookies(): Array<{ accountHint: string | null; cookie: StoredCookie[] | null }> {
  const out: Array<{ accountHint: string | null; cookie: StoredCookie[] | null }> = [];
  for (const s of sessions.values()) {
    if (s.status === 'logged_in' && s.cookie && s.cookie.length) {
      out.push({ accountHint: s.accountHint, cookie: s.cookie });
    }
  }
  return out;
}