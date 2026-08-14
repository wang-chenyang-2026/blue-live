/**
 * crawler-server MCP 客户端
 *
 * 对接电商数据爬取服务：
 *   - category(file_type="parsed")：读取已解析类目（行业 → 二级 → 三级）
 *   - download_data(category_list, category_view)：下载指定视角的销售数据
 *
 * 服务端返回通常是对 Excel 解析后的结构化数据（行列形式），字段以中文为主，
 * 例如品牌列表视角包含：品牌、销售额(万元)、销量、销售额同比、销量同比 等。
 *
 * 该模块只负责 MCP 调用与基础类型，具体"如何把行列映射成图表数据"由 API 路由/前端处理。
 */

const CRAWLER_SERVER = 'crawler-server';
const MCP_BASE = 'https://smartai.blueviewai.com/mcp';
const API_KEY = process.env.BLUEAI_API_KEY || 'blueai-tMb8xB8ZOIS8osIdqznx9KkCMBWsKA9s';

/* ========== 类型 ========== */

export type CategoryView =
  | '品类视角-大盘趋势'
  | '品类视角-销售价量'
  | '品牌列表'
  | '店铺列表'
  | '商品列表'
  | '价格区间'
  | '价格交叉'
  | '热词频次';

/** 已解析类目（file_type=parsed）的层级结构 */
export type CrawlerCategoryTree = Record<string, Record<string, string[]>>;

/** download_data 的返回数据。服务端通常给出 sheets / rows / headers / data。 */
export interface CrawlerDownloadResult {
  /** 可能存在的 sheet 名 */
  sheetName?: string;
  /** 列名（中文表头） */
  headers?: string[];
  /** 行数据（对象数组，key 为表头） */
  rows?: Record<string, unknown>[];
  /** 某些实现直接返回二维数组 */
  data?: unknown[][];
  /** 原始文本（兜底） */
  rawText?: string;
  /** 其它未知字段 */
  [key: string]: unknown;
}

/* ========== 通用 MCP HTTP 客户端 ========== */

interface McpEnvelope {
  result?: {
    content?: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

/**
 * 全局限流：crawler-server 对 API Key 有 RPM 限制，
 * 并发 3 个请求（品牌列表/大盘趋势/价格区间）会触发 KEY_RPM_EXCEEDED。
 * 这里做一个最小间隔队列，保证请求之间至少间隔 MIN_GAP_MS。
 */
const MIN_GAP_MS = 1500;
let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // 防止单个失败中断整条链
  chain = run.catch(() => undefined);
  return run;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(msg: string): boolean {
  return /KEY_RPM_EXCEEDED|rpm|rate.?limit|too many requests/i.test(msg);
}

async function mcpPostOnce<T = unknown>(
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ data: T; sessionId: string; rateLimited: boolean }> {
  const url = `${MCP_BASE}/${CRAWLER_SERVER}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${API_KEY}`,
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store' as RequestCache,
  });

  const nextSession =
    res.headers.get('mcp-session-id') ||
    res.headers.get('Mcp-Session-Id') ||
    sessionId ||
    '';

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    const msg = `MCP ${CRAWLER_SERVER} HTTP ${res.status}: ${text.slice(0, 500)}`;
    const err = new Error(msg) as Error & { rateLimited?: boolean };
    err.rateLimited = isRateLimitError(text);
    throw err;
  }

  const text = await res.text();
  let envelope: McpEnvelope | null = null;

  if (text.includes('data:')) {
    const lines = text.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr.startsWith('{')) continue;
      try {
        envelope = JSON.parse(jsonStr) as McpEnvelope;
        break;
      } catch {
        /* try next */
      }
    }
  }

  if (!envelope) {
    try {
      envelope = JSON.parse(text) as McpEnvelope;
    } catch {
      const tail = text.trim().split('\n').pop() || '';
      if (tail.startsWith('{')) {
        try {
          envelope = JSON.parse(tail) as McpEnvelope;
        } catch {
          envelope = null;
        }
      }
    }
  }

  if (!envelope) {
    throw new Error(`MCP 响应解析失败: ${text.slice(0, 300)}`);
  }
  if (envelope.error) {
    const msg = `MCP error ${envelope.error.code ?? ''}: ${envelope.error.message || 'unknown'}`;
    const err = new Error(msg) as Error & { rateLimited?: boolean };
    err.rateLimited = isRateLimitError(msg);
    throw err;
  }
  if (envelope.result?.isError) {
    const txt = envelope.result.content?.[0]?.text || 'tool error';
    const err = new Error(`MCP tool error: ${txt}`) as Error & { rateLimited?: boolean };
    err.rateLimited = isRateLimitError(txt);
    throw err;
  }

  let payload: unknown = envelope.result?.structuredContent;
  if (!payload) {
    const rawText = envelope.result?.content?.[0]?.text || '';
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { rawText };
      }
    }
  }

  return { data: payload as T, sessionId: nextSession, rateLimited: false };
}

async function mcpPost<T = unknown>(
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ data: T; sessionId: string }> {
  // 进入全局限流队列
  return withRateLimit(async () => {
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await mcpPostOnce<T>(body, sessionId);
        return { data: r.data, sessionId: r.sessionId };
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        const isRl = (lastErr as Error & { rateLimited?: boolean }).rateLimited;
        if (isRl && attempt < 3) {
          // 指数退避：3s, 8s, 15s
          const backoff = [3000, 8000, 15000][attempt];
          console.warn(`[crawler-mcp] 触发限流，${backoff}ms 后重试 (${attempt + 1}/3)`);
          await sleep(backoff);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr || new Error('mcpPost 未知错误');
  });
}

async function initSession(): Promise<string> {
  const { sessionId } = await mcpPost<unknown>({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'blue-live-crawler', version: '1.0.0' },
    },
  });

  if (!sessionId) {
    throw new Error(`MCP ${CRAWLER_SERVER} initialize 未返回 session id`);
  }

  await fetch(`${MCP_BASE}/${CRAWLER_SERVER}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${API_KEY}`,
      'Mcp-Session-Id': sessionId,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    cache: 'no-store' as RequestCache,
  }).catch(() => undefined);

  return sessionId;
}

interface ApiEnvelope<T> {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
}

function unwrap<T>(payload: unknown): T {
  const env = payload as ApiEnvelope<T>;
  if (env && typeof env === 'object' && 'code' in env) {
    if (env.code !== undefined && env.code !== 0 && env.code !== 200) {
      throw new Error(`Crawler API code=${env.code}: ${env.msg || env.message || 'unknown'}`);
    }
    return (env.data ?? ({} as T)) as T;
  }
  return payload as T;
}

/* ========== 公共工具：规范化 download_data 返回 ========== */

/**
 * crawler-server 返回的结构可能存在多种形态，这里统一抽取为：
 *   { headers, rows, rawText }
 * - 若返回 { headers: [...], rows: [...] } 直接使用
 * - 若返回 { data: [[...],[...]] }，第一行作为 headers
 * - 若返回 { list: [...] } / { result: [...] } / 纯数组，尝试读取对象数组
 * - 若是字符串，放入 rawText 供上层兜底
 */
export function normalizeDownloadResult(payload: unknown): CrawlerDownloadResult {
  const out: CrawlerDownloadResult = {};

  if (payload == null) return out;

  if (typeof payload === 'string') {
    out.rawText = payload;
    return out;
  }

  const obj = payload as Record<string, unknown>;

  // 解 API 包裹
  let inner: unknown = payload;
  if (typeof obj.code !== 'undefined' && 'data' in obj) {
    inner = obj.data;
  }

  const root = (inner && typeof inner === 'object' ? inner : {}) as Record<string, unknown>;

  // 透传一些常见元信息
  if (typeof root.sheetName === 'string') out.sheetName = root.sheetName;
  if (typeof root.title === 'string') out.sheetName = root.title;

  // 1) 标准 { headers, rows }
  if (Array.isArray(root.headers) && Array.isArray(root.rows)) {
    out.headers = root.headers as string[];
    out.rows = root.rows as Record<string, unknown>[];
    return out;
  }

  // 2) { data: [[...],[...]] }
  if (Array.isArray(root.data)) {
    const matrix = root.data as unknown[];
    if (matrix.length > 0 && Array.isArray(matrix[0])) {
      const headerRow = matrix[0] as unknown[];
      out.headers = headerRow.map((h) => String(h ?? ''));
      out.rows = matrix.slice(1).map((r) => {
        const row = r as unknown[];
        const rec: Record<string, unknown> = {};
        out.headers!.forEach((h, i) => {
          rec[h] = row[i];
        });
        return rec;
      });
      return out;
    }
    if (matrix.length > 0 && typeof matrix[0] === 'object' && matrix[0] !== null) {
      // 对象数组
      out.rows = matrix as Record<string, unknown>[];
      out.headers = Object.keys(out.rows[0]);
      return out;
    }
  }

  // 3) { list: [...] } / { result: [...] } / { items: [...] }
  for (const key of ['list', 'result', 'items', 'records']) {
    const arr = root[key];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
      out.rows = arr as Record<string, unknown>[];
      out.headers = Object.keys(out.rows[0]);
      return out;
    }
  }

  // 4) 顶层就是对象数组
  if (Array.isArray(inner) && inner.length > 0 && typeof inner[0] === 'object' && inner[0] !== null) {
    out.rows = inner as Record<string, unknown>[];
    out.headers = Object.keys(out.rows[0]);
    return out;
  }

  // 5) 兜底：JSON 字符串
  if (typeof root.rawText === 'string') {
    out.rawText = root.rawText;
  } else {
    try {
      out.rawText = JSON.stringify(inner);
    } catch {
      out.rawText = String(inner);
    }
  }
  return out;
}

/* ========== 工具：category（已解析类目） ========== */

/**
 * 读取 crawler-server 已解析类目树。
 * 目前前端品类树直接来自 src/data/category_tree.json，但保留此方法以便后续切换。
 */
export async function crawlerCategory(
  fileType: 'parsed' | 'raw' = 'parsed',
): Promise<CrawlerCategoryTree> {
  const sid = await initSession();
  const { data } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'category', arguments: { file_type: fileType } },
    },
    sid,
  );
  const unwrapped = unwrap<unknown>(data);
  // 兼容 {code,data} 或直接的层级对象
  if (
    unwrapped &&
    typeof unwrapped === 'object' &&
    !Array.isArray(unwrapped)
  ) {
    return unwrapped as CrawlerCategoryTree;
  }
  return {};
}

/* ========== 工具：download_data ========== */

export interface DownloadDataArgs {
  /** 长度固定 3：[一级, 二级, 三级]；三级传 "" 或 "全部" 表示该二级下全部 */
  categoryList: [string, string, string];
  /** 视角，见 CategoryView */
  categoryView: CategoryView;
}

export async function crawlerDownloadData(
  args: DownloadDataArgs,
): Promise<CrawlerDownloadResult> {
  if (!Array.isArray(args.categoryList) || args.categoryList.length !== 3) {
    throw new Error('categoryList 必须是长度为 3 的数组 [一级, 二级, 三级]');
  }
  const sid = await initSession();
  const { data } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'download_data',
        arguments: {
          category_list: args.categoryList,
          category_view: args.categoryView,
        },
      },
    },
    sid,
  );
  const unwrapped = unwrap<unknown>(data);
  return normalizeDownloadResult(unwrapped);
}
