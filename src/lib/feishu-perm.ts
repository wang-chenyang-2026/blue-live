/**
 * SOP v2.16 飞书「文档级授权」：
 * - 以提交人 user 身份，把平台应用加为单篇飞书文档的只读协作者（范围=单篇，最小 scope）
 * - 提供 owner 授权指引所用信息；绝不打印任何 token/secret
 * - 密钥/身份均来自进程环境变量，不在产物中硬编码
 */
import { parseFeishuToken } from '@/lib/sop-ai';

const FEISHU_BASE = 'https://open.feishu.cn';

/** 去除换行并截断，返回可安全落库/展示的短消息（不含任何凭证）。 */
export function sanitizeFeishuMsg(raw: unknown): string {
  const s = String(raw ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  return s.length > 160 ? s.slice(0, 160) : s;
}

/** 从环境 FEISHU_USER_TOKENS（JSON: { 手机号: userAccessToken }）取当前用户的飞书身份令牌。 */
export function getFeishuUserToken(phone: string | null | undefined): string | null {
  const raw = process.env.FEISHU_USER_TOKENS;
  if (!raw || !phone) return null;
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map[phone];
    return typeof v === 'string' && !!v ? (v as string) : null;
  } catch {
    return null;
  }
}

/** 按优先级取第一个可用的飞书 user 令牌（提交人优先，其次当前会话用户）。 */
export function resolveFeishuUserToken(phones: (string | null | undefined)[]): string | null {
  for (const p of phones) {
    const t = getFeishuUserToken(p);
    if (t) return t;
  }
  return null;
}

/** 平台应用（bot）在本租户内的成员身份，用于把它加为该文档协作者。 */
export interface PlatformMember {
  type: string;
  id: string;
}
export function getFeishuPlatformMember(): PlatformMember | null {
  const raw = process.env.FEISHU_PLATFORM_MEMBER;
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as { type?: string; id?: string };
    return m && m.type && m.id ? { type: m.type, id: m.id } : null;
  } catch {
    return null;
  }
}

async function feishuReq(
  token: string,
  path: string,
  init?: { method?: string; body?: string }
): Promise<{ ok: boolean; code: number; message: string; data?: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${FEISHU_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init?.body,
      signal: ctrl.signal,
    });
    const data = (await res.json()) as { code?: number; msg?: string; data?: Record<string, unknown> };
    const code = data.code ?? -1;
    return { ok: code === 0, code, message: sanitizeFeishuMsg(data.msg ?? data.data?.message ?? '飞书请求失败'), data: data.data };
  } catch (e) {
    return { ok: false, code: 0, message: sanitizeFeishuMsg(e instanceof Error ? e.message : '飞书网络错误') };
  } finally {
    clearTimeout(timer);
  }
}

/** 解析链接得到文档 token（wiki 需经 get_node 解析 obj_token）。 */
async function resolveDocumentToken(url: string, token: string): Promise<{ ok: boolean; token?: string; message?: string }> {
  const parsed = parseFeishuToken(url);
  if (!parsed) return { ok: false, message: '无法识别的飞书链接' };
  if (parsed.kind !== 'wiki') return { ok: true, token: parsed.token };
  const node = await feishuReq(token, `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(parsed.token)}`);
  if (!node.ok || !node.data) return { ok: false, message: node.message };
  const objToken = (node.data.node as Record<string, unknown> | undefined)?.obj_token;
  return objToken ? { ok: true, token: String(objToken) } : { ok: false, message: '无法解析文档节点' };
}

/**
 * 以提交人 user 身份，把平台应用加为该飞书文档的「只读（view）」协作者（仅这一篇）。
 * 失败返回结构化 message（不含任何凭证），由上层转为错误响应。
 */
export async function authorizePlatformForDoc(url: string, userToken: string): Promise<{ ok: boolean; message: string }> {
  const lower = (url ?? '').toLowerCase();
  if (!lower.includes('feishu.cn') && !lower.includes('larksuite.com')) {
    return { ok: false, message: '非飞书链接，无法授权' };
  }
  const resolved = await resolveDocumentToken(url, userToken);
  if (!resolved.ok || !resolved.token) return { ok: false, message: resolved.message ?? '无法解析文档' };

  const member = getFeishuPlatformMember();
  if (!member) {
    return { ok: false, message: '未配置平台应用协作者身份（FEISHU_PLATFORM_MEMBER），请先配置后重试' };
  }

  const body = JSON.stringify({ member_type: member.type, member_id: member.id, perm: 'view' });
  const r = await feishuReq(userToken, `/open-apis/drive/v1/permissions/${resolved.token}/collaborators?type=docx`, {
    method: 'POST',
    body,
  });
  if (r.ok) return { ok: true, message: '已将该文档授权平台只读读取' };
  // 已加过协作者等幂等场景：按业务提示
  if (r.code === 7425090 || isAlreadyMember(r.code, r.message)) {
    return { ok: true, message: '平台已在该文档协作者中' };
  }
  return { ok: false, message: `飞书授权失败：${r.message ?? r.code}` };
}

function isAlreadyMember(code: number, message: string): boolean {
  return code === 1406170 || code === 1406248 || /已.*协作者|already.*member|重复|存在/mi.test(message);
}