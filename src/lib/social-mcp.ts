/**
 * 社媒监测 MCP 专用客户端
 *
 * 对接两个 MCP 服务：
 * 1. new-media-monitoring — 舆情监测（create_monitor_task / get_task_result）
 * 2. common-tools-server — 社媒洞察/全网声量（submit_media_brief → get_media_brief_result → submit_media_task → get_media_task_result）
 *
 * 与 kol-mcp.ts 同样的设计：从 HTTP 响应头提取 mcp-session-id。
 */

const MCP_BASE = 'https://smartai.blueviewai.com/mcp';
const API_KEY = process.env.BLUEAI_API_KEY || 'blueai-tMb8xB8ZOIS8osIdqznx9KkCMBWsKA9s';

/* ============ 通用 MCP HTTP 客户端 ============ */

interface McpEnvelope {
  result?: {
    content?: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string };
}

async function mcpPost<T = unknown>(
  serverName: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ data: T; sessionId: string }> {
  const url = `${MCP_BASE}/${serverName}`;
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
    throw new Error(`MCP ${serverName} HTTP ${res.status}: ${text.slice(0, 500)}`);
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
    throw new Error(
      `MCP error ${envelope.error.code ?? ''}: ${envelope.error.message || 'unknown'}`,
    );
  }
  if (envelope.result?.isError) {
    const txt = envelope.result.content?.[0]?.text || 'tool error';
    throw new Error(`MCP tool error: ${txt}`);
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

  return { data: payload as T, sessionId: nextSession };
}

async function initSession(serverName: string): Promise<string> {
  const { sessionId } = await mcpPost<unknown>(serverName, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'blue-live-social', version: '1.0.0' },
    },
  });

  if (!sessionId) {
    throw new Error(`MCP ${serverName} initialize 未返回 session id`);
  }

  // notifications/initialized
  await fetch(`${MCP_BASE}/${serverName}`, {
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
      throw new Error(`API code=${env.code}: ${env.msg || env.message || 'unknown'}`);
    }
    return (env.data ?? ({} as T)) as T;
  }
  return payload as T;
}

/* ============ 服务一：舆情监测 new-media-monitoring ============ */

const NMM_SERVER = 'new-media-monitoring';

export interface CreateMonitorTaskArgs {
  projectName: string;
  periodDuration?: string; // P7D / P15D / P30D / PT0S
  frequency?: number; // 7/15/30 旧字段
  urlList?: string[];
  request?: Record<string, unknown>;
}

export interface CreateMonitorTaskResult {
  projectId?: number;
  project_id?: number;
  status?: number;
  statusDesc?: string;
  [key: string]: unknown;
}

export interface MonitorTaskResult {
  projectId?: number;
  status?: number;
  statusDesc?: string;
  data?: unknown;
  list?: unknown[];
  total?: number;
  [key: string]: unknown;
}

export async function nmmCreateTask(
  args: CreateMonitorTaskArgs,
): Promise<CreateMonitorTaskResult> {
  const sid = await initSession(NMM_SERVER);
  const { data } = await mcpPost<unknown>(
    NMM_SERVER,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'create_monitor_task', arguments: args },
    },
    sid,
  );
  return unwrap<CreateMonitorTaskResult>(data);
}

export async function nmmGetTaskResult(projectId: number): Promise<MonitorTaskResult> {
  const sid = await initSession(NMM_SERVER);
  const { data } = await mcpPost<unknown>(
    NMM_SERVER,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_task_result',
        arguments: { projectId: Number(projectId) },
      },
    },
    sid,
  );
  return unwrap<MonitorTaskResult>(data);
}

/* ============ 服务二：社媒洞察 common-tools-server ============ */

const CTS_SERVER = 'common-tools-server';

export interface SubmitBriefResult {
  sessionId?: number;
  status?: string;
  [key: string]: unknown;
}

export interface BriefResultData {
  status: string; // RUNNING / COMPLETED / FAILED / ABORTED
  briefKeyword?: string;
  briefPassword?: string;
  [key: string]: unknown;
}

export interface SubmitMediaTaskArgs {
  briefKeyword: string;
  briefPassword?: string;
  startTime: string;
  endTime: string;
  sourceCodes: string;
  contentModes: string;
  sessionId?: number;
}

export interface SubmitMediaTaskResult {
  bizNo?: string;
  [key: string]: unknown;
}

export interface MediaTaskResult {
  status: number; // 0采集中 1分析中 2完成 3失败 4异常
  zipUrl?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export async function ctsSubmitMediaBrief(brief: string): Promise<SubmitBriefResult> {
  const sid = await initSession(CTS_SERVER);
  const { data } = await mcpPost<unknown>(
    CTS_SERVER,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'submit_media_brief', arguments: { brief } },
    },
    sid,
  );
  return unwrap<SubmitBriefResult>(data);
}

export async function ctsGetMediaBriefResult(
  sessionId: number,
): Promise<BriefResultData> {
  const sid = await initSession(CTS_SERVER);
  const { data } = await mcpPost<unknown>(
    CTS_SERVER,
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_media_brief_result',
        arguments: { sessionId: Number(sessionId) },
      },
    },
    sid,
  );
  return unwrap<BriefResultData>(data);
}

export async function ctsSubmitMediaTask(
  args: SubmitMediaTaskArgs,
): Promise<SubmitMediaTaskResult> {
  const sid = await initSession(CTS_SERVER);
  const { data } = await mcpPost<unknown>(
    CTS_SERVER,
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'submit_media_task', arguments: args },
    },
    sid,
  );
  return unwrap<SubmitMediaTaskResult>(data);
}

export async function ctsGetMediaTaskResult(bizNo: string): Promise<MediaTaskResult> {
  const sid = await initSession(CTS_SERVER);
  const { data } = await mcpPost<unknown>(
    CTS_SERVER,
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'get_media_task_result',
        arguments: { bizNo },
      },
    },
    sid,
  );
  return unwrap<MediaTaskResult>(data);
}
