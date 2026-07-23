import { NextRequest, NextResponse } from "next/server";

// Feishu API configuration
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_a93b8a95d3785bd6';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || '2eLgcn3eAp3WvIyBdXZS5dX2fX0mX2jR';

const NICKNAME_SHEET_TOKEN = "QmESw57otiab5WkLVqdcblCmnue";
const NICKNAME_SHEETS = {
  partTime: "b88f14",
  fullTime: "CxB4xa",
};

// Schedule table configuration
const SCHEDULE_CONFIG: Record<string, { wikiToken: string; anchorSheet: string; controlSheet: string }> = {
  vivo: {
    wikiToken: "HgdSwkq98iYiy5kgxVUcVe08n5f",
    anchorSheet: "5690e8",
    controlSheet: "3xQ1Kq",
  },
  "iQOO-ks": {
    wikiToken: "XSwFwf2tPi2SOzkEeGrcctZMn7c",
    anchorSheet: "3efb46",
    controlSheet: "z2ln4e",
  },
  "iQOO-dy": {
    wikiToken: "OjXIwcmMNidCrzk5G5OcWaFJnzg",
    anchorSheet: "7fa2c2",
    controlSheet: "UyzPvX",
  },
};

// 全职人员名单（与 cost-overview 保持一致，用于识别兼职）
const FULLTIME_NAMES = new Set<string>([
  "张厚羿",
  "刘慈航",
  "倪休",
  "张睿",
  "陈世杰",
  "高新权",
  "袁智恒",
  "曲峰君",
  "洪元媛",
  "曾令飞",
  "石一淇",
]);

// 品牌到 SCHEDULE_CONFIG key 的映射
const BRAND_TO_SCHEDULES: Record<string, string[]> = {
  vivo: ["vivo"],
  iQOO: ["iQOO-ks", "iQOO-dy"],
  IOT: [], // IOT 无排班表
};

// 缓存
const cache = new Map<string, { data: unknown; expireAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getFeishuToken(): Promise<string> {
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const data = await res.json();
  return data.tenant_access_token;
}

async function readSheet(token: string, sheetToken: string, range: string): Promise<string[][]> {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/${range}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.data?.valueRange?.values || [];
}

function parseExcelDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

function stripNumbers(name: string): string {
  return name.replace(/[0-9]/g, "").replace(/[.。·]/g, "").trim();
}

function cleanSalaryName(name: string): string {
  return name.replace(/[^\u4e00-\u9fa5]+$/, "").trim();
}

async function buildNicknameMapping(feishuToken: string): Promise<{
  nicknameToReal: Record<string, string>;
  allNames: Set<string>;
}> {
  const nicknameToReal: Record<string, string> = {};
  const allNames = new Set<string>();

  try {
    const ptValues = await readSheet(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.partTime}!A1:B100`);
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

    const ftValues = await readSheet(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.fullTime}!A1:B100`);
    for (let i = 1; i < ftValues.length; i++) {
      const name = String(ftValues[i][1] || "").trim();
      if (name) {
        allNames.add(name);
      }
    }
  } catch (e) {
    console.error("Failed to build nickname mapping:", e);
  }

  return { nicknameToReal, allNames };
}

function resolveName(
  scheduleName: string,
  mapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): string {
  const cleaned = stripNumbers(scheduleName);
  if (mapping.allNames.has(cleaned)) {
    if (mapping.nicknameToReal[cleaned]) {
      return mapping.nicknameToReal[cleaned];
    }
    return cleaned;
  }
  if (mapping.nicknameToReal[cleaned]) {
    return mapping.nicknameToReal[cleaned];
  }
  return cleaned;
}

function isDayLabel(name: string): boolean {
  return /^(星期|周|礼拜)[一二三四五六日天]$/.test(name);
}

// 从一张排班表中统计: 总时长（person-hours） + 兼职人员集合
async function parseSchedule(
  feishuToken: string,
  wikiToken: string,
  sheetId: string,
  year: number,
  monthNum: number,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<{ hours: number; partTimeSet: Set<string> }> {
  const values = await readSheet(feishuToken, wikiToken, `${sheetId}!A1:CV200`);
  const hours = { v: 0 };
  const partTimeSet = new Set<string>();
  if (!values.length) return { hours: 0, partTimeSet };

  const header = values[0];
  const dateColMap: Record<number, Date> = {};

  for (let col = 2; col < header.length; col++) {
    const cell = header[col];
    if (typeof cell === "number" && cell > 40000) {
      const date = parseExcelDate(cell);
      if (date.getFullYear() === year && date.getMonth() + 1 === monthNum) {
        dateColMap[col] = date;
      }
    }
  }

  for (let row = 2; row < values.length; row++) {
    const rowData = values[row];
    if (!rowData) continue;
    for (const colStr of Object.keys(dateColMap)) {
      const col = parseInt(colStr);
      const cell = rowData[col];
      if (typeof cell === "string" && cell.trim()) {
        const names = cell.split(/[,，、]/).map((n) => n.trim()).filter(Boolean);
        for (const name of names) {
          if (isDayLabel(name)) continue;
          const cleanName = stripNumbers(name);
          if (!cleanName) continue;
          const resolvedName = resolveName(cleanName, nicknameMapping);
          hours.v += 1;
          if (!FULLTIME_NAMES.has(resolvedName)) {
            partTimeSet.add(resolvedName);
          }
        }
      }
    }
  }

  return { hours: hours.v, partTimeSet };
}

async function calcBrandStats(
  feishuToken: string,
  brandId: string,
  year: number,
  monthNum: number,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<{ totalHours: number; partTimeAnchor: number; partTimeControl: number }> {
  const scheduleKeys = BRAND_TO_SCHEDULES[brandId] || [];
  let totalHours = 0;
  const anchorSet = new Set<string>();
  const controlSet = new Set<string>();

  for (const key of scheduleKeys) {
    const cfg = SCHEDULE_CONFIG[key];
    if (!cfg) continue;

    const anchorRes = await parseSchedule(
      feishuToken,
      cfg.wikiToken,
      cfg.anchorSheet,
      year,
      monthNum,
      nicknameMapping,
    );
    totalHours += anchorRes.hours;
    anchorRes.partTimeSet.forEach((n) => anchorSet.add(n));

    const controlRes = await parseSchedule(
      feishuToken,
      cfg.wikiToken,
      cfg.controlSheet,
      year,
      monthNum,
      nicknameMapping,
    );
    totalHours += controlRes.hours;
    controlRes.partTimeSet.forEach((n) => controlSet.add(n));
  }

  return {
    totalHours,
    partTimeAnchor: anchorSet.size,
    partTimeControl: controlSet.size,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || new Date().toISOString().substring(0, 7);

  const cacheKey = `stats::${month}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }

  try {
    const [year, monthNum] = month.split("-").map(Number);
    if (!year || !monthNum) {
      return NextResponse.json({ success: false, error: "Invalid month" }, { status: 400 });
    }

    const feishuToken = await getFeishuToken();
    const nicknameMapping = await buildNicknameMapping(feishuToken);

    const [vivoStats, iqooStats, iotStats] = await Promise.all([
      calcBrandStats(feishuToken, "vivo", year, monthNum, nicknameMapping),
      calcBrandStats(feishuToken, "iQOO", year, monthNum, nicknameMapping),
      calcBrandStats(feishuToken, "IOT", year, monthNum, nicknameMapping),
    ]);

    const data = {
      month,
      brands: {
        vivo: vivoStats,
        iQOO: iqooStats,
        IOT: iotStats,
      },
    };

    cache.set(cacheKey, { data, expireAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Brand schedule stats error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 },
    );
  }
}
