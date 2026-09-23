/**
 * SOP v2 内容提炼服务：
 * - 飞书文档正文抓取（复用 feishu-notify 的 app 凭证，不新增硬编码密钥）
 * - AI 关键内容提炼（AI 网关，密钥仅走 process.env.BLUEAI_API_KEY，缺失即降级失败）
 *
 * 铁律：严禁伪造提炼结果。网关密码缺失或无可用的文本总结能力时，统一抛出错误，
 * 由调用方把 ai_status 置为 failed 并写明 ai_error 与降级提示。
 */
import { getTenantToken } from '@/lib/feishu-notify';

const FEISHU_BASE = 'https://open.feishu.cn';
// 与既有 mcp-client 等保持同一网关地址；MCP servers 仅有数据类工具，无通用 LLM chat 端点。
const MCP_BASE = 'https://smartai.blueviewai.com/mcp';

export interface RefineResult {
  summary: string;
  keypoints: string[];
}

/** 从飞书链接中解析 wiki / docx 的 token。 */
export function parseFeishuToken(url: string): { kind: 'wiki' | 'docx'; token: string } | null {
  const wiki = url.match(/\/wiki\/([A-Za-z0-9]+)/);
  if (wiki) return { kind: 'wiki', token: wiki[1] };
  const docx = url.match(/\/docx\/([A-Za-z0-9]+)/);
  if (docx) return { kind: 'docx', token: docx[1] };
  return null;
}

/**
 * 抓取飞书文档正文（返回纯文本）。
 * 仅处理 feishu.cn / larksuite.com 域名；非飞书或不可读均抛错，由上层降级。
 */
export async function fetchFeishuDocBody(url: string): Promise<string> {
  const lower = url.toLowerCase();
  if (!lower.includes('feishu.cn') && !lower.includes('larksuite.com')) {
    throw new Error('非飞书链接，无法抓取正文');
  }
  const parsed = parseFeishuToken(url);
  if (!parsed) throw new Error('无法识别的飞书链接格式');

  const token = await getTenantToken();
  let documentId = parsed.token;

  const feishuFetch = async (input: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch(input, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  if (parsed.kind === 'wiki') {
    const nodeRes = await feishuFetch(`${FEISHU_BASE}/open-apis/wiki/v2/spaces/get_node?token=${parsed.token}`);
    const nodeData = await nodeRes.json();
    if (nodeData.code !== 0) {
      throw new Error(`飞书获取文档节点失败: ${nodeData.msg ?? nodeData.code}`);
    }
    documentId = nodeData.data.node.obj_token;
  }

  const res = await feishuFetch(`${FEISHU_BASE}/open-apis/docx/v1/documents/${documentId}/raw_content`);
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书读取文档失败: ${data.msg ?? data.code}`);
  }
  const content = (data.data?.content ?? '').trim();
  if (!content) throw new Error('飞书文档正文为空');
  return content;
}

// —— v2.16 文档级授权：读取顺序 bot → 提交人 user 身份回退 ——

export type FeishuReadAs = 'bot' | 'user';
export type FeishuFetchFailureKind = 'permission' | 'notfound' | 'empty' | 'parse' | 'other';
export type FeishuFetchResult =
  | { ok: true; content: string; readAs: FeishuReadAs }
  | { ok: false; kind: FeishuFetchFailureKind; message: string };

/** 根据飞书错误码 / 文案归类为「无权限」等类别，用于标「待授权」。 */
function classifyFeishuFailure(code: number, msg: string): FeishuFetchFailureKind {
  if (code === 131006 || code === 3380004 || /无权|无权限|permission|not.*access|forbidden/i.test(msg)) {
    return 'permission';
  }
  if (code === 126004 || code === 1130003 || /不存在|not found|no node/i.test(msg)) return 'notfound';
  if (/空|empty/i.test(msg)) return 'empty';
  return 'other';
}

/** 单次以给定身份抓取，失败抛错。 */
async function fetchFeishuWithToken(url: string, token: string): Promise<string> {
  const parsed = parseFeishuToken(url);
  if (!parsed) throw Object.assign(new Error('无法识别的飞书链接格式'), { __kind: 'parse' });
  let documentId = parsed.token;

  const feishuFetch = async (input: string) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch(input, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  if (parsed.kind === 'wiki') {
    const nodeRes = await feishuFetch(
      `${FEISHU_BASE}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`
    );
    const nodeData = await nodeRes.json();
    if (nodeData.code !== 0) {
      const e = new Error(`飞书获取文档节点失败: ${nodeData.msg ?? nodeData.code}`);
      (e as { __kind?: string }).__kind = classifyFeishuFailure(nodeData.code, nodeData.msg ?? '');
      throw e;
    }
    documentId = nodeData.data.node.obj_token;
  }

  const res = await feishuFetch(`${FEISHU_BASE}/open-apis/docx/v1/documents/${documentId}/raw_content`);
  const data = await res.json();
  if (data.code !== 0) {
    const e = new Error(`飞书读取文档失败: ${data.msg ?? data.code}`);
    (e as { __kind?: string }).__kind = classifyFeishuFailure(data.code, data.msg ?? '');
    throw e;
  }
  const content = (data.data?.content ?? '').trim();
  if (!content) throw Object.assign(new Error('飞书文档正文为空'), { __kind: 'empty' });
  return content;
}

/**
 * 在线文档正文抓取：优先 bot（应用身份），失败再回退 user 身份（如提供）。
 * 返回结构化的成功/失败结果，供「待授权」状态与审计使用。
 */
export async function fetchFeishuDoc(url: string, userToken?: string | null): Promise<FeishuFetchResult> {
  const lower = (url ?? '').toLowerCase();
  if (!lower.includes('feishu.cn') && !lower.includes('larksuite.com')) {
    return { ok: false, kind: 'parse', message: '非飞书链接，无法抓取正文' };
  }

  // 1) 先应用身份（bot）
  try {
    const token = await getTenantToken();
    const content = await fetchFeishuWithToken(url, token);
    return content ? { ok: true, content, readAs: 'bot' } : { ok: false, kind: 'empty', message: '飞书文档正文为空' };
  } catch (botErr) {
    const kind = (botErr as { __kind?: string }).__kind as FeishuFetchFailureKind | undefined;
    // 2) 仅当 bot 因无权限/节点缺失等原因失败，且有 user 令牌时回退
    if (!userToken) {
      return {
        ok: false,
        kind: kind || 'other',
        message: (botErr as Error).message || '飞书应用身份读取失败',
      };
    }
    try {
      const content = await fetchFeishuWithToken(url, userToken);
      return content ? { ok: true, content, readAs: 'user' } : { ok: false, kind: 'empty', message: '飞书文档正文为空' };
    } catch (userErr) {
      const ukind = (userErr as { __kind?: string }).__kind as FeishuFetchFailureKind | undefined;
      return {
        ok: false,
        kind: ukind || kind || 'other',
        message: (userErr as Error).message || '飞书两种身份均读取失败',
      };
    }
  }
}

/**
 * AI 关键内容提炼：产出 ≤120 字概述 + 3~6 条关键要点。
 * 只读取 process.env.BLUEAI_API_KEY；缺失或网关无可用文本能力时抛错（不得伪造）。
 */
export async function refineDocument(text: string): Promise<RefineResult> {
  const apiKey = process.env.BLUEAI_API_KEY;
  if (!apiKey) {
    throw new Error('AI 提炼暂不可用：缺少 BLUEAI_API_KEY');
  }
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new Error('无可提炼的正文内容');
  }

  // 先探测网关是否暴露可用的 chat/text 总结工具（MCP tools/list）。
  const tools = await listMCPTools(apiKey);
  const textTools = tools.filter((t) =>
    /(summar|chat|text|brainstorm|think|llm|generate)/i.test(t.name)
  );
  if (textTools.length === 0) {
    throw new Error('AI 网关暂无可用文本总结能力');
  }

  const tool = textTools[0];
  const prompt = `请对以下直播运营 SOP 文档做关键内容提炼：\n1) 用不超过120字的一段话概述；\n2) 提炼 3~6 条关键要点（每条一句话）。\n\n文档正文：\n${trimmed.slice(0, 8000)}`;
  const callRes = await fetch(`${MCP_BASE}/tools/call`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: tool.name, arguments: { input: prompt, text: prompt, content: prompt } }),
  });
  if (!callRes.ok) throw new Error(`AI 网关调用失败: HTTP ${callRes.status}`);
  const callData = await callRes.json();
  const raw = extractMcpText(callData) || '';
  return parseRefineOutput(raw);
}

// —— 以下为内部辅助（MCP 探测 / 文本抽取 / 输出解析） ——

interface McpTool {
  name: string;
}

async function listMCPTools(apiKey: string): Promise<McpTool[]> {
  try {
    const res = await fetch(`${MCP_BASE}/tools/list`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.tools) ? data.tools : [];
  } catch {
    return [];
  }
}

function extractMcpText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  if (typeof d.text === 'string' && d.text) return d.text as string;
  if (Array.isArray(d.content)) {
    return (d.content as unknown[])
      .map((c) => {
        if (c && typeof c === 'object') {
          const cc = c as Record<string, unknown>;
          if (typeof cc.text === 'string') return cc.text as string;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof d.summary === 'string') return d.summary as string;
  return typeof d.output === 'string' ? (d.output as string) : '';
}

/** 尽量从模型输出里拆出 summary 与 keypoints，拆不出时整体作为 summary。 */
function parseRefineOutput(raw: string): RefineResult {
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const summaryLine = lines.find((l) => /^概述|概要|总结|摘要/.test(l)) || lines[0] || '';
  const summary = summaryLine.replace(/^概述[:：]?\s*/i, '').slice(0, 120);
  const keypoints = lines
    .filter((l) => /^[1-6][.、)]|^[-*]|^要点|关键/.test(l))
    .map((l) => l.replace(/^(\d+[.、)]|[-*])\s*/, '').replace(/^(要点|关键点)[:：]?\s*/, '').slice(0, 80))
    .filter(Boolean)
    .slice(0, 6);
  if (keypoints.length === 0 && summary) {
    return { summary, keypoints: lines.slice(1, 4).map((l) => l.slice(0, 80)) };
  }
  return { summary: summary || raw.slice(0, 120), keypoints };
}