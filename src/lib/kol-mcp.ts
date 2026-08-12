/**
 * KOL MCP 专用客户端
 *
 * 背景：通用 src/lib/mcp-client.ts 未从 HTTP 响应头 `mcp-session-id` 提取会话 ID，
 * 而 douyin-kol-api-service 严格要求会话 ID（否则返回 400 Session ID missing）。
 * 按需求约束不修改 mcp-client.ts，因此在本文件中为 KOL 服务单独实现一个
 * 符合 MCP Streamable HTTP (2024-11-05) 规范的轻量客户端。
 */

const KOL_SERVER = 'douyin-kol-api-service';
const MCP_BASE = 'https://smartai.blueviewai.com/mcp';
const API_KEY = process.env.BLUEAI_API_KEY || 'blueai-tMb8xB8ZOIS8osIdqznx9KkCMBWsKA9s';

export interface KolKeywordGroup {
  content: string;
  query: string;
  pass_word: string[];
}

export interface KolMcpMetrics {
  kolFansRangeLower?: number;
  kolFansRangeUpper?: number;
  kolNumLower?: number;
  priceLower1?: number;
  priceUpper1?: number;
  priceLower20?: number;
  priceUpper20?: number;
  priceLower60?: number;
  priceUpper60?: number;
  interactionRateAvgLower?: number;
  playAvgLower?: number;
  [key: string]: unknown;
}

export interface GenerateKeywordsResult {
  keyword_groups: KolKeywordGroup[];
  contword: string[];
  metrics: KolMcpMetrics;
  user_metrics: KolMcpMetrics;
  task_name?: string;
  [key: string]: unknown;
}

export interface CreateTaskResult {
  projectId: number;
  status?: number;
  statusDesc?: string;
  [key: string]: unknown;
}

export interface RouteTaskResult {
  projectId: number;
  status: number;
  statusDesc?: string;
  fileUrl?: string;
  fileName?: string;
  kolList?: unknown[];
  total?: number;
  [key: string]: unknown;
}

interface McpEnvelope {
  result?: {
    content?: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

/**
 * 解析 SSE / JSON 响应，同时从响应头提取 sessionId。
 */
async function mcpPost<T = unknown>(
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ data: T; sessionId: string; raw: Record<string, unknown> }> {
  const url = `${MCP_BASE}/${KOL_SERVER}`;
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
    // @ts-expect-error Node 18+ / Next edge runtime supports
    cache: 'no-store',
  });

  const nextSession =
    res.headers.get('mcp-session-id') ||
    res.headers.get('Mcp-Session-Id') ||
    sessionId ||
    '';

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown');
    throw new Error(`MCP ${KOL_SERVER} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const text = await res.text();
  let envelope: McpEnvelope | null = null;

  // SSE 优先：取最后一条 data: 行
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
      // 有些实现把 JSON 混在最后一行
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
    throw new Error(
      `MCP error ${envelope.error.code ?? ''}: ${envelope.error.message || 'unknown'}`,
    );
  }
  if (envelope.result?.isError) {
    const txt = envelope.result.content?.[0]?.text || 'tool error';
    throw new Error(`MCP tool error: ${txt}`);
  }

  // structuredContent 优先；否则解析 content[0].text
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

  return { data: payload as T, sessionId: nextSession, raw: (envelope as Record<string, unknown>) || {} };
}

/**
 * 初始化 KOL MCP 会话并发送 initialized 通知。
 */
async function initKolSession(): Promise<string> {
  const { sessionId } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'blue-live-kol', version: '1.0.0' },
      },
    },
  );

  if (!sessionId) {
    throw new Error('MCP initialize 未返回 session id');
  }

  // notifications/initialized —— 服务端通常返回 202，无 JSON body
  const url = `${MCP_BASE}/${KOL_SERVER}`;
  await fetch(url, {
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

  return sid;
}

interface KolEnvelope<T> {
  code?: number;
  msg?: string;
  data?: T;
}

function unwrap<T>(payload: unknown): T {
  const env = payload as KolEnvelope<T>;
  if (env && typeof env === 'object' && 'code' in env) {
    if (env.code !== 0 && env.code !== undefined) {
      throw new Error(`KOL API code=${env.code}: ${env.msg || 'unknown'}`);
    }
    return (env.data ?? ({} as T)) as T;
  }
  return payload as T;
}

/**
 * 调用 generate_keywords
 */
export async function kolGenerateKeywords(args: {
  compressed_brief: string;
  entity_report: Record<string, unknown>;
  full_context?: string;
}): Promise<GenerateKeywordsResult> {
  const sid = await initKolSession();
  const { data } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'generate_keywords', arguments: args },
    },
    sid,
  );
  return unwrap<GenerateKeywordsResult>(data);
}

/**
 * 调用 create_project_by_keywords
 */
export async function kolCreateProjectByKeywords(args: {
  keyword_groups: KolKeywordGroup[];
  metrics: KolMcpMetrics;
  brief?: string;
  product_name?: string;
  task_name?: string;
  user_metrics?: KolMcpMetrics;
  contword?: string[];
  entity_report?: Record<string, unknown>;
}): Promise<CreateTaskResult> {
  const sid = await initKolSession();
  const { data } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'create_project_by_keywords', arguments: args },
    },
    sid,
  );
  return unwrap<CreateTaskResult>(data);
}

/**
 * 调用 get_route_task_result
 */
export async function kolGetRouteTaskResult(
  projectId: number,
): Promise<RouteTaskResult> {
  const sid = await initKolSession();
  const { data } = await mcpPost<unknown>(
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'get_route_task_result',
        arguments: { projectId: Number(projectId) },
      },
    },
    sid,
  );
  return unwrap<RouteTaskResult>(data);
}
