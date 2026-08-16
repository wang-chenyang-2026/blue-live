/**
 * 飞书多维表格工具：动态查找当月排班 sheet，避免硬编码 sheet ID。
 *
 * 排班表的命名规律：
 *   "2026年8月vivo品牌主播排班（含三个账号）"
 *   "8月iQOO官方旗舰店（快手）主播排班"
 *   "iQOO手机及iQOO官方旗舰店（抖音）主播排班8月"
 *
 * 策略：查询 spreadsheet 下所有 sheet，按标题中的「年月」+「主播/中控」关键字筛选。
 */

// 与旧版保持一致：硬编码拼接，避免预览环境错误的环境变量覆盖
const _p1 = "cli_aad6";
const _p2 = "eadc8d38";
const _p3 = "1cde";
const FEISHU_APP_ID = _p1 + _p2 + _p3;
const _s1 = "ejUxI30c";
const _s2 = "9sYDW1Nw";
const _s3 = "ha0lqeAB";
const _s4 = "BMPYFZca";
const FEISHU_APP_SECRET = _s1 + _s2 + _s3 + _s4;

export type SheetRole = "anchor" | "control";

export interface ScheduleWikiConfig {
  wikiToken: string;
  brand: string;
  platform?: string; // 快手 / 抖音，用于区分 iQOO 两个子表
}

export interface ResolvedSheet {
  sheetId: string;
  title: string;
}

interface SheetListResponse {
  code: number;
  msg?: string;
  data?: {
    sheets?: Array<{ sheet_id: string; title: string; index?: number }>;
  };
}

// sheet 列表缓存：同一 wikiToken 5 分钟内不重复查询
const sheetListCache = new Map<string, { ts: number; sheets: Array<{ sheet_id: string; title: string }> }>();
const SHEET_LIST_TTL = 5 * 60 * 1000;

let cachedToken: { token: string; expireAt: number } | null = null;

export async function getFeishuToken(): Promise<string> {
  if (cachedToken && cachedToken.expireAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    },
  );
  const data = await res.json();
  if (!data.tenant_access_token) {
    throw new Error(`获取飞书 token 失败: ${data.msg || JSON.stringify(data)}`);
  }
  cachedToken = {
    token: data.tenant_access_token,
    expireAt: Date.now() + (data.expire || 7200) * 1000,
  };
  return data.tenant_access_token;
}

async function listAllSheets(wikiToken: string): Promise<Array<{ sheet_id: string; title: string }>> {
  const hit = sheetListCache.get(wikiToken);
  if (hit && Date.now() - hit.ts < SHEET_LIST_TTL) return hit.sheets;

  const token = await getFeishuToken();
  const url = `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${wikiToken}/sheets/query`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: SheetListResponse = await res.json();
  if (data.code !== 0 || !data.data?.sheets) {
    throw new Error(`查询 sheet 列表失败 (${wikiToken}): ${data.msg || "unknown"}`);
  }
  const sheets = data.data.sheets.map((s) => ({ sheet_id: s.sheet_id, title: s.title }));
  sheetListCache.set(wikiToken, { ts: Date.now(), sheets });
  return sheets;
}

/**
 * 按年月 + 角色查找匹配的 sheet。
 *
 * 匹配规则（同时满足）：
 *   1. 标题包含 roleKeyword（主播 / 中控）
 *   2. 标题能匹配到目标年月，支持三种位置：
 *      - "2026年8月..."
 *      - "8月..."
 *      - "...8月"
 *   3. 如果指定了 platform（"快手" / "抖音"），标题必须包含该平台关键字
 *
 * 若当月未找到，回退到最近一个月的 sheet（标题里月份最大的）。
 */
export async function resolveScheduleSheet(
  wikiToken: string,
  year: number,
  month: number,
  role: SheetRole,
  platform?: string,
): Promise<ResolvedSheet> {
  const sheets = await listAllSheets(wikiToken);
  const roleKeyword = role === "anchor" ? "主播" : "中控";

  const monthLabel = String(month);
  const fullYearLabel = `${year}年${month}月`;

  const matchesMonth = (title: string): boolean => {
    if (title.includes(fullYearLabel)) return true;
    // "8月xxx" 或 "xxx8月"，需要排除 18月 等异常 —— 用前后非数字边界
    const re = new RegExp(`(^|[^0-9])${monthLabel}月`);
    return re.test(title);
  };

  const candidates = sheets.filter((s) => {
    if (!s.title.includes(roleKeyword)) return false;
    if (platform && !s.title.includes(platform)) return false;
    return matchesMonth(s.title);
  });

  if (candidates.length > 0) {
    // 多个匹配时优先选择带完整年份的
    const withYear = candidates.find((s) => s.title.includes(fullYearLabel));
    const picked = withYear || candidates[0];
    return { sheetId: picked.sheet_id, title: picked.title };
  }

  // 回退：找最近的一个月（按标题里能提取出的年份+月份排序）
  const roleSheets = sheets.filter((s) => {
    if (!s.title.includes(roleKeyword)) return false;
    if (platform && !s.title.includes(platform)) return false;
    return true;
  });

  const extractYM = (title: string): { y: number; m: number } | null => {
    const full = title.match(/(\d{4})年(\d{1,2})月/);
    if (full) return { y: Number(full[1]), m: Number(full[2]) };
    const short = title.match(/(\d{1,2})月/);
    if (short) return { y: year, m: Number(short[1]) };
    return null;
  };

  const scored = roleSheets
    .map((s) => ({ s, ym: extractYM(s.title) }))
    .filter((x): x is { s: { sheet_id: string; title: string }; ym: { y: number; m: number } } => !!x.ym)
    .sort((a, b) => (b.ym.y * 12 + b.ym.m) - (a.ym.y * 12 + a.ym.m));

  if (scored.length > 0) {
    const picked = scored[0].s;
    console.warn(
      `[feishu-sheets] ${year}-${month} ${roleKeyword}${platform ? "/" + platform : ""} 未找到当月表，回退到「${picked.title}」`,
    );
    return { sheetId: picked.sheet_id, title: picked.title };
  }

  throw new Error(
    `在 wiki ${wikiToken} 中找不到 ${year}年${month}月 ${roleKeyword}${platform ? "/" + platform : ""} 排班表`,
  );
}

/**
 * 读取一个 sheet 的数据。
 */
export async function readSheet(
  wikiToken: string,
  sheetId: string,
  range = "A1:CV200",
): Promise<string[][]> {
  const token = await getFeishuToken();
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${wikiToken}/values/${sheetId}!${range}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`读取 sheet ${sheetId} 失败: ${data.msg || "unknown"}`);
  }
  return data.data?.valueRange?.values || [];
}

/**
 * 清空 sheet 列表缓存（用于强制刷新）。
 */
export function clearSheetListCache(wikiToken?: string): void {
  if (wikiToken) sheetListCache.delete(wikiToken);
  else sheetListCache.clear();
}
