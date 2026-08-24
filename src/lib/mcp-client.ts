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

async function mcpRequest(
  serverName: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<Record<string, unknown>> {
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
          return JSON.parse(jsonStr);
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
        return JSON.parse(line);
      }
    }
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function initializeServer(serverName: string): Promise<{ sessionId: string; tools: MCPTool[] }> {
  // Initialize session
  const initRes = await mcpRequest(serverName, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'blue-live-market-monitor', version: '1.0.0' },
    },
  });

  const newSessionId = (initRes.result as Record<string, unknown>)?.['sessionId'] as string || '';

  // List tools
  const toolsRes = await mcpRequest(
    serverName,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    newSessionId || undefined,
  );

  const tools: MCPTool[] = ((toolsRes.result as Record<string, unknown>)?.['tools'] as MCPTool[]) || [];
  return { sessionId: newSessionId, tools };
}

export async function callTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string,
): Promise<MCPToolResult> {
  const callBody: Record<string, unknown> = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const res = await mcpRequest(serverName, callBody, sessionId);

  const result = res.result as MCPToolResult | undefined;
  if (result?.isError) {
    throw new Error(
      `Tool ${toolName} error: ${result.content?.[0]?.text || 'unknown error'}`,
    );
  }

  return result || { content: [{ type: 'text', text: JSON.stringify(res) }] };
}

/**
 * Initialize all MCP servers and return their tools
 */
export async function initAllServers(): Promise<Record<string, { sessionId: string; tools: MCPTool[] }>> {
  const results: Record<string, { sessionId: string; tools: MCPTool[] }> = {};
  const initPromises = SERVERS.map(async (name) => {
    try {
      const { sessionId, tools } = await initializeServer(name);
      results[name] = { sessionId, tools };
    } catch (err) {
      console.error(`[MCP] Failed to init ${name}:`, err);
      results[name] = { sessionId: '', tools: [] };
    }
  });

  await Promise.all(initPromises);
  return results;
}

/**
 * Get category tree from crawler-server
 */
export async function getCategoryTree(): Promise<unknown> {
  try {
    const { sessionId } = await initializeServer('crawler-server');
    const result = await callTool('crawler-server', 'category', {}, sessionId);
    const text = result.content?.[0]?.text || '';
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * Download market data from crawler-server
 */
export async function downloadMarketData(params: {
  category_list: string[];
  category_view: string;
  start_date?: string;
  end_date?: string;
  brand?: string;
}): Promise<MCPToolResult> {
  const { sessionId } = await initializeServer('crawler-server');
  return callTool(
    'crawler-server',
    'download_data',
    {
      category_list: params.category_list,
      category_view: params.category_view,
      start_date: params.start_date || '2025-06',
      end_date: params.end_date || '2026-06',
      brand: params.brand || '',
    },
    sessionId,
  );
}

/**
 * Parse intent from user message and determine which MCP service/tools to call
 */
export interface ParsedIntent {
  service: ServerName | null;
  tool: string | null;
  category?: string[];
  view?: string;
  brand?: string;
  timeRange?: { start: string; end: string };
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

const SERVICE_KEYWORDS: Record<string, ServerName> = {
  '电商': 'crawler-server',
  '数据': 'crawler-server',
  '市场': 'crawler-server',
  '销售': 'crawler-server',
  '品牌': 'crawler-server',
  '新媒体': 'new-media-monitoring',
  '舆情': 'new-media-monitoring',
  '监测': 'new-media-monitoring',
  '抖音': 'douyin-kol-api-service',
  '达人': 'douyin-kol-api-service',
  'kol': 'douyin-kol-api-service',
  'KOL': 'douyin-kol-api-service',
  '标签': 'dim-server',
  '维表': 'dim-server',
  '社媒': 'common-tools-server',
  '洞察': 'common-tools-server',
  'brief': 'common-tools-server',
};

export function parseIntent(message: string): ParsedIntent {
  const intent: ParsedIntent = {
    service: null,
    tool: null,
    rawMessage: message,
  };

  // Detect service
  for (const [keyword, service] of Object.entries(SERVICE_KEYWORDS)) {
    if (message.includes(keyword)) {
      intent.service = service;
      break;
    }
  }

  // Default to crawler-server for market data queries
  if (!intent.service) {
    intent.service = 'crawler-server';
  }

  // Detect view type
  for (const [keyword, view] of Object.entries(VIEW_KEYWORDS)) {
    if (message.includes(keyword)) {
      intent.view = view;
      break;
    }
  }

  // Default view
  if (!intent.view && intent.service === 'crawler-server') {
    intent.view = '品类视角-大盘趋势';
  }

  return intent;
}
