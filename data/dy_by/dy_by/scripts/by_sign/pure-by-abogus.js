"use strict";

// ───────────────────── 巨量百应 / 电商罗盘 a_bogus 签名器 ─────────────────────
// compass.jinritemai.com 与 buyin.jinritemai.com 的 /compass_api/author/** 前缀强制校验
// a_bogus, 不带就返回 {"code":11001,"msg":"当前网络不稳定，请稍后再试"}(HTTP 仍是 200)。
// /compass_api/content_live/** 不校验, 所以 channel_flow 裸请求能通。
//
// 签名由 ByteDance BDMS SDK 1.0.1.20 产出, 与懂车帝同版本, vendor 直接复用。
// 做法: jsdom 里按浏览器顺序加载 7 个 SDK, 显式调 _SdkGlueInit + bdms.init,
// 然后调用被层层包装后的 window.fetch, 从我们伪造的"原生 fetch"里截获最终 URL。
//
// 关键坑 1: bdms.init 是 JSVMP 编译产物, 不显式调用它, fetch/URLSearchParams 的签名
//           包装就不会安装, 拿不到任何 a_bogus。
// 关键坑 2: initOpts 必须是页面真实的那套(aid 4499 / pageId 28161 / paths.include 含
//           '/compass_api'), 路径不在 include 里 bdms 会直接放行不签名。
//           这套值取自 compass 页面 inline 的 _SdkGlueInit(...)。
// 关键坑 3: a_bogus 对整条 query 串原样签名, 且 msToken 也参与签名。
//           所以签完之后不能再动任何参数, 也不能重新 urlencode, 否则 11001。
// 关键坑 4: URLSearchParams 要在 init 之后重新 hook(core-js polyfill 会换掉原生实现)。

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const VENDOR = path.join(__dirname, "vendor");
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const PAGE_URL = "https://compass.jinritemai.com/talent/live-statement";

// 取自 compass 页面 inline 的 _SdkGlueInit 实参, 换站点时只改这里
const BY_AID = 4499;
const BY_PAGE_ID = 28161;
const BY_PATHS = [
  "/business_api", "/compass_api", "/compassapi", "/marketing", "/byteshop",
  "/strategy_api", "/compass_app", "/strategy_manage", "/strategy_market",
  "/compass_promotion", "/infra_service", "/strategy_crowd", "/strategy_product",
  "/strategy_content", "/strategy_author", "/strategy_workshop", "/ecom",
  "/square_pc_api", "/api", "/privilege_api", "/comment_api",
  "/alliance_crm_api", "/square_api", "/pc", "/selection_api", "/connection",
];

const SDK_SCRIPTS = [
  "sdk-glue.js",
  "bdms.js",
  "secsdk-runtime-cached.js",
  "secsdk.umd.js",
  "secsdk-strategy-669.js",
  "secsdk-config-669.js",
  "secsdk-project-669.js",
];

function buildDom({ ua = DEFAULT_UA, pageUrl = PAGE_URL, cookie = "" } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", () => {});
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
    url: pageUrl,
    referrer: pageUrl,
    contentType: "text/html",
    userAgent: ua,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const { window } = dom;

  for (const kv of String(cookie).split(";")) {
    const one = kv.trim();
    if (one) {
      try { window.document.cookie = one; } catch (_) {}
    }
  }

  Object.defineProperty(window.navigator, "userAgent", { get: () => ua, configurable: true });
  try {
    Object.defineProperty(window.navigator, "webdriver", { get: () => false, configurable: true });
  } catch (_) {}
  if (!window.navigator.languages || !window.navigator.languages.length) {
    Object.defineProperty(window.navigator, "languages", {
      get: () => ["zh-CN", "zh", "en"], configurable: true,
    });
  }
  window.chrome = window.chrome || { runtime: {} };
  try {
    Object.defineProperty(window.screen, "width", { value: 1536, configurable: true });
    Object.defineProperty(window.screen, "height", { value: 864, configurable: true });
  } catch (_) {}
  for (const [k, v] of [["innerWidth", 1536], ["innerHeight", 864],
                        ["outerWidth", 1536], ["outerHeight", 864]]) {
    Object.defineProperty(window, k, { value: v, configurable: true });
  }
  return dom;
}

function loadSdks(window) {
  const report = [];
  for (const name of SDK_SCRIPTS) {
    try {
      const code = fs.readFileSync(path.join(VENDOR, name), "utf8");
      // 造一个 <script> 元素, SDK 内部会读 document.currentScript 的 src / project-id
      const el = window.document.createElement("script");
      el.setAttribute("src", "https://local-vendor/" + name);
      window.document.head.appendChild(el);
      const origDesc = Object.getOwnPropertyDescriptor(window.Document.prototype, "currentScript");
      Object.defineProperty(window.document, "currentScript", { get: () => el, configurable: true });
      try {
        window.eval(code);
      } finally {
        if (origDesc) {
          Object.defineProperty(window.Document.prototype, "currentScript", origDesc);
        }
        delete window.document.currentScript;
      }
      report.push({ name, ok: true });
    } catch (e) {
      report.push({ name, ok: false, err: String(e).slice(0, 300) });
    }
  }
  return report;
}

async function sign_url(targetUrl, opts = {}) {
  const dom = buildDom(opts);
  const { window } = dom;
  const seen = [];

  // 伪造"原生 fetch": SDK 层层包装后最终会调到这里, 这时 URL 已带好 msToken + a_bogus
  window.fetch = function nativeFetch(input) {
    const url = typeof input === "string" ? input : input && input.url;
    seen.push(String(url));
    return Promise.resolve({
      ok: true, status: 200, statusText: "OK", url: String(url),
      headers: new window.Headers(), redirected: false, type: "basic",
      body: null, bodyUsed: false,
      text: () => Promise.resolve(""),
      json: () => Promise.resolve({}),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new window.Blob([""])),
      clone() { return this; },
    });
  };

  const loadReport = loadSdks(window);
  await new Promise((r) => setTimeout(r, 50));

  const initOpts = {
    self: { aid: BY_AID, pageId: BY_PAGE_ID },
    bdms: {
      aid: BY_AID, pageId: BY_PAGE_ID, ddrt: 3,
      paths: { include: BY_PATHS }, track: {},
    },
    csrf: { "compass.jinritemai.com": { TOKEN_PATH: "/business_api" } },
  };
  const initReport = {};
  try {
    if (typeof window._SdkGlueInit === "function") {
      window._SdkGlueInit(initOpts);
      initReport.glue = true;
    }
  } catch (e) { initReport.glueErr = String(e).slice(0, 200); }
  try {
    if (window.bdms && typeof window.bdms.init === "function") {
      window.bdms.init(initOpts.bdms);
      initReport.bdms = true;
    }
  } catch (e) { initReport.bdmsErr = String(e).slice(0, 200); }

  await new Promise((r) => setTimeout(r, 200));

  let error = null;
  try {
    await window.fetch(targetUrl);
  } catch (e) {
    error = String(e);
  }

  const finalUrl = seen.length ? seen[seen.length - 1] : null;
  let aBogus = null;
  let msToken = null;
  if (finalUrl) {
    const u = new URL(finalUrl);
    aBogus = u.searchParams.get("a_bogus");
    msToken = u.searchParams.get("msToken");
  }
  dom.window.close();
  return { finalUrl, a_bogus: aBogus, msToken, error, loadReport, initReport };
}

module.exports = { sign_url };

// CLI: node pure-by-abogus.js "<url>" [cookieFile]
if (require.main === module) {
  const url = process.argv[2];
  const cookieFile = process.argv[3];
  let cookie = "";
  if (cookieFile && fs.existsSync(cookieFile)) {
    cookie = fs.readFileSync(cookieFile, "utf8").trim();
  }
  const pageUrl = process.env.BY_PAGE_URL || PAGE_URL;
  sign_url(url, { cookie, pageUrl })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => {
      console.log(JSON.stringify({ finalUrl: null, a_bogus: null, error: String(e) }));
      process.exit(1);
    });
}
