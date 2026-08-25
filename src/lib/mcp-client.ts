/**
 * MCP (Model Context Protocol) Client for BlueAI services
 * Supports Streamable HTTP transport (2024-11-05)
 */

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
    data?: unknown;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPSession {
  serverName: string;
  sessionId: string;
  tools: MCPTool[];
}

const MCP_BASE = 'https://smartai.blueviewai.com/mcp';
const API_KEY = process.env.BLUEAI_API_KEY || 'blueai-tMb8xB8ZOIS8osIdqznx9KkCMBWsKA9s';

const SERVERS = [
  'crawler-server',
  'new-media-monitoring',
  'douyin-kol-api-service',
  'dim-server',
  'common-tools-server',
] as const;

export type ServerName = (typeof SERVERS)[number];

export interface ParsedIntent {
  service: string;
  view: string;
  category: string[];
  brand: string;
  timeRange: string;
  metric: string;
  rawMessage: string;
}

const VIEW_KEYWORDS: Record<string, string> = {
  '大盘趋势': '品类视角-大盘趋势',
  '趋势': '品类视角-大盘趋势',
  '销售价量': '品类视角-销售价量',
  '销售额': '品类视角-销售价量',
  '销量': '品类视角-销售价量',
  '品牌列表': '品类视角-品牌列表',
  '品牌排行': '品类视角-品牌列表',
  '品牌': '品类视角-品牌列表',
  '店铺列表': '品类视角-店铺列表',
  '店铺': '品类视角-店铺列表',
  '商品列表': '品类视角-商品列表',
  '商品': '品类视角-商品列表',
  '价格区间': '品类视角-价格区间',
  '价格': '品类视角-价格区间',
  '价格交叉': '品类视角-价格交叉',
  '热词': '品类视角-热词频次',
  '热词频次': '品类视角-热词频次',
  '关键词': '品类视角-热词频次',
};

export function parseIntent(message: string): ParsedIntent {
  const intent: ParsedIntent = {
    service: 'crawler-server',
    view: '',
    category: [],
    brand: '',
    timeRange: '近90天',
    metric: '',
    rawMessage: message,
  };

  // Detect service
  if (message.includes('新媒体') || message.includes('舆情') || message.includes('社媒')) {
    intent.service = 'new-media-monitoring';
  } else if (message.includes('达人') || message.includes('KOL') || message.includes('kol')) {
    intent.service = 'douyin-kol-api-service';
  }

  // Detect view
  for (const [keyword, view] of Object.entries(VIEW_KEYWORDS)) {
    if (message.includes(keyword)) {
      intent.view = view;
      break;
    }
  }

  // Detect time range
  const timePatterns: Record<string, string> = {
    '近30天': '近30天',
    '近一个月': '近30天',
    '近90天': '近90天',
    '近三个月': '近90天',
    '近半年': '近半年',
    '近一年': '近一年',
    '本年度': '本年度',
    '今年': '本年度',
  };
  for (const [pattern, range] of Object.entries(timePatterns)) {
    if (message.includes(pattern)) {
      intent.timeRange = range;
      break;
    }
  }

  if (!intent.view && intent.service === 'crawler-server') {
    intent.view = '品类视角-大盘趋势';
  }

  return intent;
}

interface MCPResponse {
  result?: unknown;
  sessionId?: string;
}

async function mcpRequest(
  serverName: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<MCPResponse> {
  const url = `${MCP_BASE}/${serverName}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${API_KEY}`,
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  // Extract session ID from response headers
  const responseSessionId =
    res.headers.get('mcp-session-id') ||
    res.headers.get('Mcp-Session-Id') ||
    undefined;

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`MCP ${serverName} error: ${res.status} ${text}`);
  }

  const text = await res.text();

  // Handle SSE (Server-Sent Events) format from Streamable HTTP
  // SSE messages look like: "data: {json}\n\ndata: {json}\n\n"
  if (text.includes('data:')) {
    const dataLines = text.split('\n').filter((l) => l.startsWith('data:'));
    // Use the last data line (usually contains the final response)
    for (let i = dataLines.length - 1; i >= 0; i--) {
      const jsonStr = dataLines[i].replace(/^data:\s*/, '').trim();
      if (jsonStr && jsonStr.startsWith('{')) {
        try {
          return { result: JSON.parse(jsonStr), sessionId: responseSessionId || sessionId };
        } catch {
          continue;
        }
      }
    }
  }

  // Try direct JSON parse
  try {
    const lines = text.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line && line.startsWith('{')) {
        return { result: JSON.parse(line), sessionId: responseSessionId || sessionId };
      }
    }
    return { result: JSON.parse(text), sessionId: responseSessionId || sessionId };
  } catch {
    return { result: { raw: text }, sessionId: responseSessionId || sessionId };
  }
}

/**
 * Initialize MCP server session
 */
const sessions = new Map<string, MCPSession>();

// Per-server request queue to prevent concurrency-triggered rate limits
const queueTail = new Map<string, Promise<unknown>>();

async function withQueue<T>(serverName: string, fn: () => Promise<T>): Promise<T> {
  const prev = queueTail.get(serverName) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => { release = resolve; });
  queueTail.set(serverName, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    // Clean up if this is still the tail
    if (queueTail.get(serverName) === next) {
      queueTail.delete(serverName);
    }
  }
}

function isRateLimitError(msg: string): boolean {
  return /RPM|CONCURRENCY|KEY_RPM|rate.?limit|429/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function initializeServerInternal(serverName: string): Promise<MCPSession> {
  const initRes = await mcpRequest(serverName, {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'blueai-mcp-client', version: '1.0.0' },
    },
    id: 1,
  });

  const newSessionId = initRes.sessionId || '';

  // Send initialized notification
  await mcpRequest(
    serverName,
    {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    },
    newSessionId,
  );

  // List tools
  const toolsRes = await mcpRequest(
    serverName,
    {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 2,
    },
    newSessionId,
  );

  const toolsResult = toolsRes.result as { result?: { tools?: MCPTool[] } } | undefined;
  const tools = toolsResult?.result?.tools || [];

  const session: MCPSession = {
    serverName,
    sessionId: newSessionId,
    tools,
  };

  sessions.set(serverName, session);
  return session;
}

export async function initializeServer(
  serverName: string,
  forceNew = false,
): Promise<MCPSession> {
  return withQueue(serverName, async () => {
    if (!forceNew && sessions.has(serverName)) {
      return sessions.get(serverName)!;
    }
    if (forceNew) sessions.delete(serverName);
    return initializeServerInternal(serverName);
  });
}

/**
 * Call MCP tool with retry on rate limit / session expiry
 */
export async function callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
): Promise<MCPToolResult> {
  return withQueue(serverName, () =>
    callToolInternal(serverName, toolName, args, sessionId, false),
  );
}

async function callToolInternal(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
  forceNewSession = false,
): Promise<MCPToolResult> {
  if (!sessionId || forceNewSession) {
    const session = await initializeServer(serverName, forceNewSession);
    sessionId = session.sessionId;
  }

  if (!sessionId) {
    throw new Error(`Session ID missing for ${serverName}`);
  }

  // Retry up to 4 times with exponential backoff for rate limits
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const callBody = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
        id: Date.now() + attempt,
      };

      const res = await mcpRequest(serverName, callBody, sessionId);
      const envelope = res.result as
        | { result?: MCPToolResult; error?: { message?: string } }
        | undefined;
      const result = envelope?.result;

      if (!result) {
        const errMsg = envelope?.error?.message || 'MCP callTool returned no result';
        // Rate limit → retry after backoff
        if (isRateLimitError(errMsg)) {
          lastErr = new Error(errMsg);
          await sleep(800 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`MCP ${toolName} error: ${errMsg}`);
      }

      if (result.isError) {
        const errorText = result.content?.[0]?.text || 'Unknown MCP error';
        if (isRateLimitError(errorText)) {
          lastErr = new Error(errorText);
          await sleep(800 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(`MCP tool error: ${errorText}`);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Session expired / not found → force reinit once
      if (!forceNewSession && /session|not found|invalid/i.test(msg)) {
        return callToolInternal(serverName, toolName, args, undefined, true);
      }
      if (isRateLimitError(msg)) {
        lastErr = err;
        await sleep(800 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`MCP ${toolName} failed after retries`);
}

/**
 * Get category tree from dim-server
 */
export async function getCategoryTree(): Promise<Record<string, Record<string, string[]>>> {
  try {
    const session = await initializeServer('dim-server');
    const result = await callTool('dim-server', 'get_category_tree', {}, session.sessionId);

    const textContent = result.content?.[0]?.text || '';
    const parsed = JSON.parse(textContent);

    // dim-server returns {code: 200, data: [...]}
    if (parsed.code === 200 && Array.isArray(parsed.data)) {
      const tree: Record<string, Record<string, string[]>> = {};
      for (const item of parsed.data) {
        const l1 = item['一级品类'] || item['level1'];
        const l2 = item['二级品类'] || item['level2'];
        const l3 = item['三级品类'] || item['level3'];
        if (l1 && l2 && l3) {
          if (!tree[l1]) tree[l1] = {};
          if (!tree[l1][l2]) tree[l1][l2] = [];
          if (!tree[l1][l2].includes(l3)) {
            tree[l1][l2].push(l3);
          }
        }
      }
      return tree;
    }

    return {};
  } catch (error) {
    console.error('[MCP] getCategoryTree error:', error);
    return {};
  }
}

/**
 * Clear all sessions
 */
export function clearSessions(): void {
  sessions.clear();
}
