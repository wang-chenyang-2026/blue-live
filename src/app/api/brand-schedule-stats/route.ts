import { NextRequest, NextResponse } from "next/server";
import {
  getFeishuToken,
  readSheet,
  resolveScheduleSheet,
} from "@/lib/feishu-sheets";

const NICKNAME_SHEET_TOKEN = "QmESw57otiab5WkLVqdcblCmnue";
const NICKNAME_SHEETS = {
  partTime: "b88f14",
  fullTime: "CxB4xa",
};

// 排班表 wiki 配置（动态解析当月 sheet）—— 仅用于统计兼职人数 & 交叉校验
const SCHEDULE_WIKIS: Record<string, Array<{ wikiToken: string; platform?: string }>> = {
  vivo: [{ wikiToken: "HgdSwkq98iYiy5kgxVUcVe08n5f" }],
  "iQOO-ks": [{ wikiToken: "XSwFwf2tPi2SOzkEeGrcctZMn7c", platform: "快手" }],
  "iQOO-dy": [{ wikiToken: "OjXIwcmMNidCrzk5G5OcWaFJnzg", platform: "抖音" }],
};

// 基础数据汇总表（实际直播时长数据源）
interface DataSource {
  token: string;
  sheetId: string;
  label: string;
}
const DATA_SOURCES: Record<string, DataSource[]> = {
  vivo: [
    { token: "D2lOwohBDilDdgka9Ilc6U3xnib", sheetId: "0a2100", label: "vivo" },
  ],
  iQOO: [
    { token: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "RYPvqw", label: "iQOO快手" },
    { token: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "0a2100", label: "iQOO抖音" },
  ],
  IOT: [
    { token: "H7cpwf3rwiDvGOkZVYlcqJASnaf", sheetId: "0a2100", label: "IOT平板" },
    { token: "H7cpwf3rwiDvGOkZVYlcqJASnaf", sheetId: "RYPvqw", label: "IOT手表" },
  ],
};

const FULLTIME_NAMES = new Set<string>([
  "张厚羿", "刘慈航", "倪休", "张睿", "陈世杰", "高新权", "袁智恒",
  "曲峰君", "洪元媛", "曾令飞", "石一淇",
]);

const BRAND_TO_SCHEDULES: Record<string, string[]> = {
  vivo: ["vivo"],
  iQOO: ["iQOO-ks", "iQOO-dy"],
  IOT: [],
};

const cache = new Map<string, { data: unknown; expireAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseExcelDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const beijingOffset = 8 * 3600 * 1000;
  const d = new Date(utcMs + beijingOffset);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function stripNumbers(name: string): string {
  return name.replace(/[0-9]/g, "").replace(/[.。·]/g, "").trim();
}

function cleanSalaryName(name: string): string {
  return name.replace(/[^\u4e00-\u9fa5]+$/, "").trim();
}

// 解析"8月1日"/"2026年8月1日"为 {year, month, day}
function parseChineseDate(raw: unknown, fallbackYear: number): { y: number; m: number; d: number } | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const full = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (full) return { y: Number(full[1]), m: Number(full[2]), d: Number(full[3]) };
  const short = s.match(/(\d{1,2})月(\d{1,2})日/);
  if (short) return { y: fallbackYear, m: Number(short[1]), d: Number(short[2]) };
  return null;
}

function dateInRange(d: { y: number; m: number; d: number }, start: Date, end: Date): boolean {
  const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
  const t = dt.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function buildNicknameMapping(feishuToken: string): Promise<{
  nicknameToReal: Record<string, string>;
  allNames: Set<string>;
}> {
  const nicknameToReal: Record<string, string> = {};
  const allNames = new Set<string>();

  try {
    const ptValues = await readSheetRaw(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.partTime}!A1:B100`);
    for (let i = 1; i < ptValues.length; i++) {
      const rawName = String(ptValues[i][0] || "").trim();
      const nickname = String(ptValues[i][1] || "").trim();
      if (rawName && nickname) {
        const realName = cleanSalaryName(rawName);
        nicknameToReal[nickname] = realName;
        allNames.add(realName);
        allNames.add(nickname);
      }
    }
    const ftValues = await readSheetRaw(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.fullTime}!A1:B100`);
    for (let i = 1; i < ftValues.length; i++) {
      const name = String(ftValues[i][1] || "").trim();
      if (name) allNames.add(name);
    }
  } catch (e) {
    console.error("Failed to build nickname mapping:", e);
  }
  return { nicknameToReal, allNames };
}

async function readSheetRaw(token: string, sheetToken: string, range: string): Promise<string[][]> {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`读取 ${sheetToken} 失败: ${data.msg}`);
  return data.data?.valueRange?.values || [];
}

function resolveName(
  scheduleName: string,
  mapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): string {
  const cleaned = stripNumbers(scheduleName);
  if (mapping.allNames.has(cleaned)) {
    if (mapping.nicknameToReal[cleaned]) return mapping.nicknameToReal[cleaned];
    return cleaned;
  }
  if (mapping.nicknameToReal[cleaned]) return mapping.nicknameToReal[cleaned];
  return cleaned;
}

function isDayLabel(name: string): boolean {
  return /^(星期|周|礼拜)[一二三四五六日天]$/.test(name);
}

/**
 * 从基础数据汇总表 D 列读取"实际直播时长"，按日期范围过滤。
 * 返回每日各账号时长明细 + 总计。
 */
async function readLiveHours(
  source: DataSource,
  start: Date,
  end: Date,
  year: number,
): Promise<{ total: number; daily: Record<string, number>; accounts: Record<string, number>; rows: number }> {
  const token = await getFeishuToken();
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${source.token}/values/${source.sheetId}!A1:K2000?valueRenderOption=FormattedValue`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`读取数据表 ${source.label} 失败: ${data.msg}`);
  }
  const values: unknown[][] = data.data?.valueRange?.values || [];
  let total = 0;
  let rows = 0;
  const daily: Record<string, number> = {};
  const accounts: Record<string, number> = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const yearCell = row[0] != null ? Number(row[0]) : year;
    const parsed = parseChineseDate(row[1], Number.isFinite(yearCell) ? yearCell : year);
    if (!parsed) continue;
    if (!dateInRange(parsed, start, end)) continue;
    const hours = toNum(row[3]);
    if (hours <= 0) continue;
    const account = String(row[2] || "未命名账号").trim() || "未命名账号";
    total += hours;
    rows++;
    const key = `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    daily[key] = (daily[key] || 0) + hours;
    accounts[account] = (accounts[account] || 0) + hours;
  }
  return { total, daily, accounts, rows };
}

/**
 * 从排班表读取给定日期范围的人时（主播+中控分别统计），用于兼职人数统计与交叉校验。
 */
async function readSchedulePersonHours(
  wikiToken: string,
  anchorSheetId: string,
  controlSheetId: string,
  start: Date,
  end: Date,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<{ anchorHours: number; controlHours: number; partTimeAnchor: Set<string>; partTimeControl: Set<string> }> {
  const [anchorVals, controlVals] = await Promise.all([
    readSheet(wikiToken, anchorSheetId, "A1:CV200"),
    readSheet(wikiToken, controlSheetId, "A1:CV200"),
  ]);

  const process = (vals: string[][]): { hours: number; partTime: Set<string> } => {
    if (!vals.length) return { hours: 0, partTime: new Set() };
    const header = vals[0] || [];
    const dateCols: Array<{ col: number; date: Date }> = [];
    for (let c = 2; c < header.length; c++) {
      const cell = header[c];
      if (typeof cell === "number" && cell > 40000) {
        const d = parseExcelDate(cell);
        if (d.getTime() >= start.getTime() && d.getTime() <= end.getTime()) {
          dateCols.push({ col: c, date: d });
        }
      }
    }
    let hours = 0;
    const partTime = new Set<string>();
    for (let r = 2; r < vals.length; r++) {
      const row = vals[r];
      if (!row) continue;
      for (const { col } of dateCols) {
        const cell = row[col];
        if (typeof cell === "string" && cell.trim()) {
          const names = cell.split(/[,，、]/).map((n) => n.trim()).filter(Boolean);
          for (const name of names) {
            if (isDayLabel(name)) continue;
            const clean = stripNumbers(name);
            if (!clean) continue;
            const resolved = resolveName(clean, nicknameMapping);
            hours += 1;
            if (!FULLTIME_NAMES.has(resolved)) partTime.add(resolved);
          }
        }
      }
    }
    return { hours, partTime };
  };

  const a = process(anchorVals as string[][]);
  const c = process(controlVals as string[][]);
  return {
    anchorHours: a.hours,
    controlHours: c.hours,
    partTimeAnchor: a.partTime,
    partTimeControl: c.partTime,
  };
}

type Severity = "ok" | "warn" | "error";
interface CrossCheck {
  severity: Severity;
  liveHours: number;
  scheduleHours: number;
  partTimeAnchor: number;
  partTimeControl: number;
  ratio: number | null;
  messages: string[];
  daily: Record<string, number>;
  accounts: Record<string, number>;
}

async function calcBrand(
  brandId: string,
  start: Date,
  end: Date,
  year: number,
  monthNum: number,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<CrossCheck> {
  // 1) 读直播时长（数据表 D 列）
  const sources = DATA_SOURCES[brandId] || [];
  let liveHours = 0;
  const mergedDaily: Record<string, number> = {};
  const mergedAccounts: Record<string, number> = {};
  for (const src of sources) {
    try {
      const r = await readLiveHours(src, start, end, year);
      liveHours += r.total;
      Object.entries(r.daily).forEach(([k, v]) => (mergedDaily[k] = (mergedDaily[k] || 0) + v));
      Object.entries(r.accounts).forEach(([k, v]) => (mergedAccounts[k] = (mergedAccounts[k] || 0) + v));
    } catch (e) {
      console.warn(`[brand-stats] readLiveHours ${src.label} failed:`, e);
    }
  }

  // 2) 读排班人时 & 兼职人数
  let scheduleHours = 0;
  const anchorSet = new Set<string>();
  const controlSet = new Set<string>();
  const scheduleKeys = BRAND_TO_SCHEDULES[brandId] || [];
  for (const key of scheduleKeys) {
    const targets = SCHEDULE_WIKIS[key];
    if (!targets) continue;
    for (const target of targets) {
      try {
        const [a, c] = await Promise.all([
          resolveScheduleSheet(target.wikiToken, year, monthNum, "anchor", target.platform),
          resolveScheduleSheet(target.wikiToken, year, monthNum, "control", target.platform),
        ]);
        const sh = await readSchedulePersonHours(
          target.wikiToken,
          a.sheetId,
          c.sheetId,
          start,
          end,
          nicknameMapping,
        );
        scheduleHours += sh.anchorHours + sh.controlHours;
        sh.partTimeAnchor.forEach((n) => anchorSet.add(n));
        sh.partTimeControl.forEach((n) => controlSet.add(n));
      } catch (e) {
        console.warn(`[brand-stats] schedule ${key} read failed:`, e);
      }
    }
  }

  // 3) 交叉校验
  const messages: string[] = [];
  let severity: Severity = "ok";

  // 3.1 单日直播时长合理性：一个账号一日通常 ≤ 24h，多账号合计可能更高
  const accountCount = Object.keys(mergedAccounts).length || 1;
  for (const [day, h] of Object.entries(mergedDaily)) {
    if (h > 24 * accountCount + 4) {
      messages.push(`${day} 直播 ${h}h 超过 ${accountCount} 账号×24h 上限`);
      severity = "error";
    }
  }

  // 3.2 直播时长 vs 排班人时：直播应 ≤ 排班人时（排班含主播+中控）
  let ratio: number | null = null;
  if (liveHours > 0 && scheduleHours > 0) {
    ratio = Number((scheduleHours / liveHours).toFixed(2));
    if (liveHours > scheduleHours) {
      messages.push(`直播时长 ${liveHours}h 超过排班人时 ${scheduleHours}h（异常：直播时长不应大于排班人时）`);
      severity = "error";
    } else if (ratio < 1.2) {
      messages.push(`排班/直播比 = ${ratio}，偏低（通常应在 1.5~2.5 之间，一场直播需主播+中控两人）`);
      if (severity !== "error") severity = "warn";
    } else if (ratio > 4) {
      messages.push(`排班/直播比 = ${ratio}，偏高，可能存在无效排班或未开播`);
      if (severity !== "error") severity = "warn";
    }
  }

  // 3.3 有排班无直播（可能未实际开播或未录入）
  if (scheduleHours > 0 && liveHours === 0) {
    messages.push(`排班人时 ${scheduleHours}h，但直播时长为 0（可能未开播或数据未录入）`);
    severity = "error";
  }

  // 3.4 完全无数据
  if (liveHours === 0 && scheduleHours === 0) {
    messages.push("所选日期范围内无直播数据，也无排班数据");
    severity = "warn";
  }

  return {
    severity,
    liveHours: Number(liveHours.toFixed(2)),
    scheduleHours,
    partTimeAnchor: anchorSet.size,
    partTimeControl: controlSet.size,
    ratio,
    messages,
    daily: mergedDaily,
    accounts: mergedAccounts,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const today = new Date();
  const month = searchParams.get("month") || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const startStr = searchParams.get("start");
  const endStr = searchParams.get("end");

  const [year, monthNum] = month.split("-").map(Number);
  if (!year || !monthNum) {
    return NextResponse.json({ success: false, error: "Invalid month" }, { status: 400 });
  }

  // 默认日期范围：当月1日 ~ 今天（不能超过当月最后一天）。用 UTC 构造避免时区偏移。
  const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
  const monthEnd = new Date(Date.UTC(year, monthNum, 0));
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const defaultEnd = todayUTC < monthEnd ? todayUTC : monthEnd;
  const parseUTC = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const start = startStr ? parseUTC(startStr) : monthStart;
  const end = endStr ? parseUTC(endStr) : defaultEnd;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });
  }

  const cacheKey = `stats::${month}::${start.toISOString().slice(0, 10)}::${end.toISOString().slice(0, 10)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }

  try {
    const feishuToken = await getFeishuToken();
    const nicknameMapping = await buildNicknameMapping(feishuToken);

    const [vivo, iQOO, IOT] = await Promise.all([
      calcBrand("vivo", start, end, year, monthNum, nicknameMapping),
      calcBrand("iQOO", start, end, year, monthNum, nicknameMapping),
      calcBrand("IOT", start, end, year, monthNum, nicknameMapping),
    ]);

    const data = {
      month,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      // 备注：日期均按 UTC 构造，等价于北京时间自然日
      brands: {
        vivo: {
          totalHours: vivo.liveHours,
          scheduleHours: vivo.scheduleHours,
          partTimeAnchor: vivo.partTimeAnchor,
          partTimeControl: vivo.partTimeControl,
          crossCheck: {
            severity: vivo.severity,
            ratio: vivo.ratio,
            messages: vivo.messages,
          },
        },
        iQOO: {
          totalHours: iQOO.liveHours,
          scheduleHours: iQOO.scheduleHours,
          partTimeAnchor: iQOO.partTimeAnchor,
          partTimeControl: iQOO.partTimeControl,
          crossCheck: {
            severity: iQOO.severity,
            ratio: iQOO.ratio,
            messages: iQOO.messages,
          },
        },
        IOT: {
          totalHours: IOT.liveHours,
          scheduleHours: IOT.scheduleHours,
          partTimeAnchor: IOT.partTimeAnchor,
          partTimeControl: IOT.partTimeControl,
          crossCheck: {
            severity: IOT.severity,
            ratio: IOT.ratio,
            messages: IOT.messages,
          },
        },
      },
    };
    cache.set(cacheKey, { data, expireAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Brand schedule stats error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
