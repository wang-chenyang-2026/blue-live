import { chromium } from 'playwright-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOGIN_URL = 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24';

interface ImgInfo {
  src: string;
  w: number;
  h: number;
  alt: string;
  nw: number;
  nh: number;
}

interface DebugInfo {
  browserLaunched: boolean;
  pageLoaded: boolean;
  pageStatus: number | null;
  pageUrl: string | null;
  qrFound: boolean;
  timingMs: { launch: number; goto: number; qr: number; screenshot: number };
  engine: string;
  shotMode: string;
  shotBytes: number;
}

interface SpikeResult {
  ok: boolean;
  failedStep: string | null;
  error: string | null;
  image: string | null;
  debug: DebugInfo;
}

async function runSpike(): Promise<SpikeResult> {
  const debug: DebugInfo = {
    browserLaunched: false,
    pageLoaded: false,
    pageStatus: null,
    pageUrl: null,
    qrFound: false,
    timingMs: { launch: 0, goto: 0, qr: 0, screenshot: 0 },
    engine: 'playwright-core@1.51.1 chromium-1161 (headless)',
    shotMode: 'none',
    shotBytes: 0,
  };
  const result: SpikeResult = { ok: false, failedStep: null, error: null, image: null, debug };

  let browserRef: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    let t = Date.now();
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--no-zygote',
      ],
    });
    browserRef = browser;
    debug.browserLaunched = true;
    debug.timingMs.launch = Date.now() - t;

    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'zh-CN',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);

    t = Date.now();
    const resp = await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    debug.timingMs.goto = Date.now() - t;
    debug.pageLoaded = true;
    debug.pageStatus = resp ? resp.status() : null;
    debug.pageUrl = page.url();

    if (debug.pageStatus != null && debug.pageStatus >= 400) {
      result.failedStep = 'goto';
      result.error = `页面加载失败，HTTP ${debug.pageStatus}`;
    } else {
      // 等待 open.douyin.com/qrconnect 二维码 iframe 稳定存在（≥1.5s 内不消失）
      t = Date.now();
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
      debug.timingMs.qr = Date.now() - t;

      if (!stable) {
        result.failedStep = 'qrFrame';
        result.error = 'open.douyin.com/qrconnect 二维码 iframe 未出现或未稳定（可能被风控/未渲染）';
      } else {
        // 截取二维码图（真实二维码是 iframe 内一个 raster <img>，刷新按钮是 svg 图标，需排除）
        t = Date.now();
        let shot: Buffer | null = null;
        let shotMode = 'none';
        let found = false;
        for (let i = 0; i < 8 && !shot; i++) {
          const f = page.frames().find((x) => x.url().includes('open.douyin.com/qrconnect'));
          if (!f) continue;
          try {
            // 若出现刷新占位，点击触发 get_qrcode 重试
            await f.waitForTimeout(1200);
            const info: ImgInfo[] = await f.evaluate(() =>
              Array.from(document.querySelectorAll('img')).map((im) => ({
                src: im.src.slice(0, 200),
                w: Math.round(im.getBoundingClientRect().width),
                h: Math.round(im.getBoundingClientRect().height),
                alt: im.alt,
                nw: im.naturalWidth,
                nh: im.naturalHeight,
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
                  found = true;
                }
              }
            }
          } catch {
            /* 帧可能被页面重挂载，容忍并重试 */
          }
          if (!shot) await page.waitForTimeout(1000);
        }

        // 兜底：整页截图
        if (!shot) {
          const fp = await page.screenshot({ fullPage: false }).catch(() => null);
          if (fp && fp.length > 200) {
            shot = fp;
            shotMode = 'full-page';
            found = true;
          }
        }

        debug.timingMs.screenshot = Date.now() - t;
        debug.shotMode = shotMode;
        debug.shotBytes = shot ? shot.length : 0;
        debug.qrFound = found && !!shot;

        if (shot) {
          result.ok = true;
          result.image = `data:image/png;base64,${shot.toString('base64')}`;
        } else {
          result.failedStep = 'qrElement';
          result.error = '未截到二维码（含整页兜底失败）；二维码接口可能被风控拦截';
        }
      }
    }
  } catch (e) {
    result.failedStep = result.failedStep || (debug.browserLaunched ? 'run' : 'launch');
    result.error = result.error || (e instanceof Error ? e.message : String(e));
  } finally {
    if (browserRef) await browserRef.close().catch(() => undefined);
  }

  return result;
}

export async function POST() {
  const res = await runSpike();
  return Response.json(res, { status: 200 });
}

export async function GET() {
  const res = await runSpike();
  return Response.json(res, { status: 200 });
}