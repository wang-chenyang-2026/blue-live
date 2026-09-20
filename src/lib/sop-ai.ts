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

  if (parsed.kind === 'wiki') {
    const nodeRes = await fetch(`${FEISHU_BASE}/open-apis/wiki/v2/spaces/get_node?token=${parsed.token}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const nodeData = await nodeRes.json();
    if (nodeData.code !== 0) {
      throw new Error(`飞书获取文档节点失败: ${nodeData.msg ?? nodeData.code}`);
    }
    documentId = nodeData.data.node.obj_token;
  }

  const res = await fetch(`${FEISHU_BASE}/open-apis/docx/v1/documents/${documentId}/raw_content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书读取文档失败: ${data.msg ?? data.code}`);
  }
  const content = (data.data?.content ?? '').trim();
  if (!content) throw new Error('飞书文档正文为空');
  return content;
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