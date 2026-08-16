import { NextRequest, NextResponse } from "next/server";
import {
  getFeishuToken,
  readSheet,
  resolveScheduleSheet,
  type SheetRole,
} from "@/lib/feishu-sheets";

// Salary management table for nickname → real name mapping
const NICKNAME_SHEET_TOKEN = "QmESw57otiab5WkLVqdcblCmnue";
const NICKNAME_SHEETS = {
  partTime: "b88f14", // 兼职 sheet (A=姓名, B=花名)
  fullTime: "CxB4xa", // 全职 sheet (A=所属项目, B=姓名)
};

// 排班表 wiki 配置（不再硬编码 sheet ID，运行时按年月动态查找）
const SCHEDULE_CONFIG = {
  vivo: [
    { wikiToken: "HgdSwkq98iYiy5kgxVUcVe08n5f", platform: undefined as string | undefined },
  ],
  "iQOO-ks": [
    { wikiToken: "XSwFwf2tPi2SOzkEeGrcctZMn7c", platform: "快手" },
  ],
  "iQOO-dy": [
    { wikiToken: "OjXIwcmMNidCrzk5G5OcWaFJnzg", platform: "抖音" },
  ],
};

// Data table configuration (for purchase costs)
const DATA_CONFIG = {
  vivo: { wikiToken: "D2lOwohBDilDdgka9Ilc6U3xnib", sheetId: "0a2100", purchaseCol: 10 },
  "iQOO-ks": { wikiToken: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "RYPvqw", purchaseCol: 10 },
  "iQOO-dy": { wikiToken: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "0a2100", purchaseCol: 10 },
  IOT: { wikiToken: "H7cpwf3rwiDvGOkZVYlcqJASnaf", sheetId: "0a2100", purchaseCol: 10 },
};

// 2026 Legal holidays
const LEGAL_HOLIDAYS_2026: Record<string, string[]> = {
  "01": ["01", "02", "03"],
  "02": ["15", "16", "17", "18", "19", "20", "21", "22", "23"],
  "04": ["04", "05", "06"],
  "05": ["01", "02", "03", "04", "05"],
  "06": ["19", "20", "21"],
  "09": ["25", "26", "27"],
  "10": ["01", "02", "03", "04", "05", "06", "07"],
};

// 兼职主播时薪从飞书薪资表动态读取，不再硬编码
// 旧的硬编码 ANCHOR_RATES 中 "刘欣3649: 3649" 把工号误当成时薪，导致片片薪资虚高
interface AnchorRate {
  rate: number;
  nickname?: string; // 花名
}

async function buildAnchorRates(feishuToken: string): Promise<Record<string, AnchorRate>> {
  const rates: Record<string, AnchorRate> = {};
  try {
    const values = await readSheetFeishu(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.partTime}!A1:H100`);
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row || row.length < 4) continue;
      const rawName = String(row[0] || "").trim();
      const nickname = String(row[1] || "").trim();
      const role = String(row[2] || "").trim();
      const salaryStr = String(row[3] || "").trim();

      if (!rawName || role !== "主播") continue;

      // 解析时薪：支持 "180/小时"、"170元/小时"、"150" 等格式
      const m = salaryStr.match(/(\d+)/);
      if (!m) continue;
      const rate = Number(m[1]);

      // key 用完整姓名（保留工号后缀以区分两个刘欣），同时用花名做备选 key
      rates[rawName] = { rate, nickname: nickname || undefined };
      if (nickname) rates[nickname] = { rate, nickname: rawName };
    }
  } catch (e) {
    console.error("Failed to build anchor rates:", e);
  }
  return rates;
}

interface DateRange {
  start: Date;
  end: Date;
}

/** 把日期范围展开为 (year, month, dayStart, dayEnd) 列表，支持跨月 */
function expandMonths(range: DateRange): Array<{ year: number; month: number; dayStart: number; dayEnd: number }> {
  const out: Array<{ year: number; month: number; dayStart: number; dayEnd: number }> = [];
  const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
  while (cursor <= endMonth) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    const daysInMonth = new Date(y, m, 0).getDate();
    const dayStart =
      cursor.getFullYear() === range.start.getFullYear() && cursor.getMonth() === range.start.getMonth()
        ? range.start.getDate()
        : 1;
    const dayEnd =
      cursor.getFullYear() === range.end.getFullYear() && cursor.getMonth() === range.end.getMonth()
        ? range.end.getDate()
        : daysInMonth;
    out.push({ year: y, month: m, dayStart, dayEnd });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

// Build full-time employee config dynamically from Feishu salary sheet
async function buildFulltimeConfig(feishuToken: string): Promise<
  Record<string, { brand: string; base: number; subsidy: number; role: string; nickname?: string }>
> {
  const config: Record<string, { brand: string; base: number; subsidy: number; role: string; nickname?: string }> = {};

  try {
    // 读取 A:H 列（含补贴、备注等）
    const values = await readSheetFeishu(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.fullTime}!A1:H100`);
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row || row.length < 4) continue;
      const rawProject = String(row[0] || "").trim();
      const name = String(row[1] || "").trim();
      const role = String(row[2] || "").trim();
      const base = Number(row[3]);
      const subsidy = Number(row[4]) || 500;

      if (!name || !rawProject || !role || isNaN(base) || base <= 0) continue;

      let brand = rawProject;
      if (rawProject.includes("iQOO")) brand = "iQOO";
      else if (rawProject.includes("vivo")) brand = "vivo";
      else if (rawProject.toUpperCase().includes("IOT")) brand = "IOT";

      // 从备注列提取花名（格式如：花名为"芙芙"或花名为"芙芙"）
      let nickname: string | undefined;
      for (let c = 5; c < Math.min(row.length, 8); c++) {
        const cell = row[c];
        if (typeof cell === "string") {
          // 支持中英文引号：" " " "
          const m = cell.match(/花名[为为:：\s]*["\u201c\u201d]([^"\u201c\u201d]+)["\u201c\u201d]/);
          if (m) { nickname = m[1].trim(); break; }
        }
      }

      config[name] = { brand, base, subsidy, role, nickname };
    }
  } catch (e) {
    console.error("Failed to build fulltime config:", e);
  }
  return config;
}

async function readSheetFeishu(token: string, sheetToken: string, range: string): Promise<string[][]> {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.code !== 0) throw new Error(`读取 ${sheetToken} 失败: ${data.msg}`);
  return data.data?.valueRange?.values || [];
}

async function getSheetIdFromWiki(token: string, wikiToken: string): Promise<string> {
  const url = `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${wikiToken}/sheets/query`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.data?.sheets?.[0]?.sheet_id || "";
}

function parseExcelDate(serial: number): Date {
  // Excel serial 以 UTC 1899-12-30 为基准，加 8 小时偏移得到北京时间
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const beijingOffset = 8 * 3600 * 1000;
  // 取整到天，避免毫秒误差
  const ms = utcMs + beijingOffset;
  const d = new Date(ms);
  // 归一化为北京时间当天 00:00
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function stripNumbers(name: string): string {
  return name.replace(/[0-9]/g, "").replace(/[.。·]/g, "").trim();
}

function cleanSalaryName(name: string): string {
  return name.replace(/[^\u4e00-\u9fa5]+$/, "").trim();
}

async function buildNicknameMapping(
  feishuToken: string,
  fulltimeConfig?: Record<string, { brand: string; base: number; subsidy: number; role: string; nickname?: string }>,
): Promise<{
  nicknameToReal: Record<string, string>;
  allNames: Set<string>;
  fulltimeNames: Set<string>;
}> {
  const nicknameToReal: Record<string, string> = {};
  const allNames = new Set<string>();
  const fulltimeNames = new Set<string>();

  try {
    // 先标记全职员工真名（高优先级，不被兼职花名覆盖）
    if (fulltimeConfig) {
      for (const [realName, cfg] of Object.entries(fulltimeConfig)) {
        fulltimeNames.add(realName);
        allNames.add(realName);
        if (cfg.nickname) {
          nicknameToReal[cfg.nickname] = realName;
          allNames.add(cfg.nickname);
        }
      }
    }

    const ptValues = await readSheetFeishu(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.partTime}!A1:B100`);
    for (let i = 1; i < ptValues.length; i++) {
      const rawName = String(ptValues[i][0] || "").trim();
      const nickname = String(ptValues[i][1] || "").trim();
      if (rawName && nickname) {
        // 保留完整姓名（含工号后缀），以区分同名不同人（如刘欣3649/刘欣6549）
        // 但如果花名与全职员工真名冲突，不覆盖全职映射
        if (!fulltimeNames.has(nickname)) {
          nicknameToReal[nickname] = rawName;
        }
        allNames.add(rawName);
        if (!fulltimeNames.has(nickname)) {
          allNames.add(nickname);
        }
      }
    }
    const ftValues = await readSheetFeishu(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.fullTime}!A1:B100`);
    for (let i = 1; i < ftValues.length; i++) {
      const name = String(ftValues[i][1] || "").trim();
      if (name) allNames.add(name);
    }
  } catch (e) {
    console.error("Failed to build nickname mapping:", e);
  }
  return { nicknameToReal, allNames, fulltimeNames };
}

function resolveName(
  scheduleName: string,
  mapping: { nicknameToReal: Record<string, string>; allNames: Set<string>; fulltimeNames?: Set<string> },
): string {
  // 0. 全职员工真名直接返回（最高优先级，不被兼职花名映射覆盖）
  if (mapping.fulltimeNames?.has(scheduleName)) return scheduleName;
  // 1. 花名直接映射（片片→刘欣3649，芙芙→石一淇）
  if (mapping.nicknameToReal[scheduleName]) return mapping.nicknameToReal[scheduleName];
  // 2. 全名匹配（刘欣3649）
  if (mapping.allNames.has(scheduleName)) return scheduleName;
  // 3. 去数字后检查是否是全职员工真名（如"曾令飞"匹配全职"曾令飞"而非兼职"曾令飞0524"）
  const cleaned = stripNumbers(scheduleName);
  if (mapping.fulltimeNames?.has(cleaned)) return cleaned;
  // 4. 去数字后花名映射
  if (mapping.nicknameToReal[cleaned]) return mapping.nicknameToReal[cleaned];
  if (mapping.allNames.has(cleaned)) return cleaned;
  // 5. 兜底返回去数字后的名字
  return cleaned;
}

function isDayLabel(name: string): boolean {
  return /^(星期|周|礼拜)[一二三四五六日天]$/.test(name);
}

function isLegalHoliday(date: Date): boolean {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return LEGAL_HOLIDAYS_2026[month]?.includes(day) || false;
}

function countWeekendDays(year: number, month: number): { saturdays: number; sundays: number } {
  let saturdays = 0;
  let sundays = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow === 6) saturdays++;
    if (dow === 0) sundays++;
  }
  return { saturdays, sundays };
}

function getLegalHolidayCount(year: number, month: number): number {
  return LEGAL_HOLIDAYS_2026[String(month).padStart(2, "0")]?.length || 0;
}

/**
 * 核心：遍历指定品牌的排班表，按日期范围内的每一天逐个统计姓名。
 * 使用动态 sheet 解析，自动适配月份。
 */
async function collectScheduleHours(
  feishuToken: string,
  brand: string,
  role: SheetRole,
  range: DateRange,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<{ nameHours: Record<string, number>; nameDays: Record<string, Set<string>>; nameHolidayDays: Record<string, Set<string>>; nameNightHours: Record<string, number> }> {
  const nameHours: Record<string, number> = {};
  const nameDays: Record<string, Set<string>> = {};
  const nameHolidayDays: Record<string, Set<string>> = {};
  const nameNightHours: Record<string, number> = {};

  // 选品牌 → 选择要扫的 (wikiToken, platform) 列表
  let targets: Array<{ wikiToken: string; platform?: string }> = [];
  if (brand === "vivo") targets = SCHEDULE_CONFIG.vivo;
  else if (brand === "iQOO") targets = [...SCHEDULE_CONFIG["iQOO-ks"], ...SCHEDULE_CONFIG["iQOO-dy"]];
  else if (brand === "iQOO-ks") targets = SCHEDULE_CONFIG["iQOO-ks"];
  else if (brand === "iQOO-dy") targets = SCHEDULE_CONFIG["iQOO-dy"];
  else if (brand === "all") {
    targets = [...SCHEDULE_CONFIG.vivo, ...SCHEDULE_CONFIG["iQOO-ks"], ...SCHEDULE_CONFIG["iQOO-dy"]];
  }

  const months = expandMonths(range);

  for (const target of targets) {
    for (const { year, month, dayStart, dayEnd } of months) {
      // 动态解析当月 sheet
      let sheetId: string;
      try {
        const resolved = await resolveScheduleSheet(target.wikiToken, year, month, role, target.platform);
        sheetId = resolved.sheetId;
      } catch (e) {
        console.warn(`[collectScheduleHours] ${brand}/${role} ${year}-${month} 未找到sheet，跳过:`, e);
        continue;
      }

      const values = await readSheet(target.wikiToken, sheetId, "A1:CV200");
      if (!values.length) continue;

      const header = values[0];
      const dateColMap: Record<number, Date> = {};
      for (let col = 2; col < header.length; col++) {
        const cell = header[col];
        if (typeof cell === "number" && cell > 40000) {
          const date = parseExcelDate(cell);
          if (date.getFullYear() === year && date.getMonth() + 1 === month) {
            const d = date.getDate();
            if (d >= dayStart && d <= dayEnd) {
              dateColMap[col] = date;
            }
          }
        }
      }

      for (let row = 2; row < values.length; row++) {
        const rowData = values[row];
        if (!rowData) continue;
        // 读取 B 列时段（如 "2-3点"、"8-9点"），判断是否凌晨2-8点补贴时段
        const timeLabel = String(rowData[1] || "").trim();
        const tm = timeLabel.match(/(\d{1,2})\s*[-:：]\s*(\d{1,2})/);
        const startHour = tm ? parseInt(tm[1]) : -1;
        // 凌晨2点(含)到8点(不含)之间的时段
        const isNightShift = startHour >= 2 && startHour < 8;
        for (const colStr of Object.keys(dateColMap)) {
          const col = parseInt(colStr);
          const date = dateColMap[col];
          const cell = rowData[col];
          if (typeof cell === "string" && cell.trim()) {
            const names = cell.split(/[,，、/／]/).map((n) => n.trim()).filter(Boolean);
            const dateKey = localDateStr(date);
            const holiday = isLegalHoliday(date);
            for (const name of names) {
              if (isDayLabel(name)) continue;
              const cleanName = stripNumbers(name);
              if (!cleanName) continue;
              const resolvedName = resolveName(cleanName, nicknameMapping);
              nameHours[resolvedName] = (nameHours[resolvedName] || 0) + 1;
              if (isNightShift && role === "anchor") {
                nameNightHours[resolvedName] = (nameNightHours[resolvedName] || 0) + 1;
              }
              if (!nameDays[resolvedName]) nameDays[resolvedName] = new Set();
              nameDays[resolvedName].add(dateKey);
              if (holiday) {
                if (!nameHolidayDays[resolvedName]) nameHolidayDays[resolvedName] = new Set();
                nameHolidayDays[resolvedName].add(dateKey);
              }
            }
          }
        }
      }
    }
  }

  return { nameHours, nameDays, nameHolidayDays, nameNightHours };
}

// Dimension A: 兼职主播成本
async function calcAnchorCost(
  feishuToken: string,
  brand: string,
  range: DateRange,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
  anchorRates: Record<string, AnchorRate>,
): Promise<{ total: number; details: Array<{ name: string; hours: number; nightHours: number; rate: number; nightSubsidy: number; serviceFee: number; cost: number }> }> {
  const { nameHours, nameNightHours } = await collectScheduleHours(feishuToken, brand, "anchor", range, nicknameMapping);

  const details: Array<{ name: string; hours: number; nightHours: number; rate: number; nightSubsidy: number; serviceFee: number; cost: number }> = [];
  for (const [resolvedName, hours] of Object.entries(nameHours)) {
    // 全职主播跳过（在全职成本里算）
    // resolvedName 是清洗后的真名（如"刘欣3649"），不是花名
    // 用完整姓名匹配费率表
    let rateEntry = anchorRates[resolvedName];
    let matchedName = resolvedName;
    if (!rateEntry) {
      // 尝试 stripNumbers 后匹配（费率表 key 可能是纯中文姓名）
      const stripped = stripNumbers(resolvedName);
      const k = Object.keys(anchorRates).find(
        (key) => stripNumbers(key) === stripped || key === resolvedName,
      );
      if (k) {
        rateEntry = anchorRates[k];
        matchedName = k;
      }
    }
    if (!rateEntry) continue; // 未在兼职主播薪资表中的（如全职主播）跳过

    const nightHours = nameNightHours[resolvedName] || 0;
    const baseSalary = hours * rateEntry.rate;
    const nightSubsidy = nightHours * 20; // 凌晨2-8点每小时+20元
    const salaryBeforeFee = baseSalary + nightSubsidy;
    const serviceFee = Math.round(salaryBeforeFee * 0.066 * 100) / 100; // 服务费6.6%
    const cost = Math.round((salaryBeforeFee + serviceFee) * 100) / 100;

    details.push({
      name: matchedName,
      hours,
      nightHours,
      rate: rateEntry.rate,
      nightSubsidy,
      serviceFee,
      cost,
    });
  }
  details.sort((a, b) => b.hours - a.hours);
  return { total: Math.round(details.reduce((s, d) => s + d.cost, 0) * 100) / 100, details };
}

// Dimension B: 兼职中控成本
async function calcControlCost(
  feishuToken: string,
  brand: string,
  range: DateRange,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
  fulltimeConfig: Record<string, { brand: string; base: number; subsidy: number; role: string; nickname?: string }>,
): Promise<{ total: number; details: Array<{ name: string; hours: number; cost: number; serviceFee: number; mode: string }> }> {
  const { nameHours } = await collectScheduleHours(feishuToken, brand, "control", range, nicknameMapping);

  const details: Array<{ name: string; hours: number; cost: number; serviceFee: number; mode: string }> = [];

  for (const [name, hours] of Object.entries(nameHours)) {
    // 全职员工跳过
    if (name in fulltimeConfig) continue;

    // 用去数字后的纯中文姓名匹配特殊薪资规则（排班表中"杨子洬"→薪资表"杨子洬1325"）
    const baseName = stripNumbers(name);
    let salary = 0;
    let mode = "";
    if (baseName === "洪媛媛") {
      mode = "底薪5000";
      salary = hours <= 150 ? (hours >= 130 ? 5000 : 0) : 5000 + (hours - 150) * 40;
    } else if (baseName === "杨子洬") {
      mode = "底薪5000";
      salary = hours <= 150 ? (hours >= 130 ? 5000 : 0) : 5000 + (hours - 150) * 35;
    } else if (["钟雨辰", "黄孝杰", "田晓辉"].includes(baseName)) {
      mode = "纯时薪50/h";
      salary = hours * 50;
    } else if (baseName === "曾令飞") {
      // 曾令飞 7月起转全职，这里只在7月前算
      const y = range.start.getFullYear();
      const m = range.start.getMonth() + 1;
      if (y < 2026 || (y === 2026 && m < 7)) {
        mode = "混合";
        salary = (5000 / 24) * (hours / 8) + 500 + Math.max(0, hours - 192) * 35;
      } else {
        continue;
      }
    } else if (baseName === "卞云龙") {
      mode = "特殊";
      salary = hours <= 130 ? 5000 : hours * 50;
    } else {
      mode = "默认50/h";
      salary = hours * 50;
    }
    const serviceFee = Math.round(salary * 0.066 * 100) / 100;
    const cost = Math.round((salary + serviceFee) * 100) / 100;
    details.push({ name, hours, cost, serviceFee, mode });
  }

  details.sort((a, b) => b.hours - a.hours);
  return { total: Math.round(details.reduce((s, d) => s + d.cost, 0) * 100) / 100, details };
}

// Dimension C: 全职员工成本
async function calcFulltimeCost(
  feishuToken: string,
  brand: string,
  range: DateRange,
  fulltimeConfig: Record<string, { brand: string; base: number; subsidy: number; role: string; nickname?: string }>,
  nicknameMapping: { nicknameToReal: Record<string, string>; allNames: Set<string> },
): Promise<{ total: number; details: Array<{ name: string; base: number; subsidy: number; cost: number; role: string; hours?: number; days?: number }> }> {
  // 全职成本按「整月」概念算底薪，按日期范围算实际出勤和加班
  // 取范围内第一个月作为计薪基准月（跨月时主要场景是单月，跨月时分摊简化为按首月）
  const months = expandMonths(range);
  const primary = months[0];
  const year = primary.year;
  const monthNum = primary.month;
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const { saturdays, sundays } = countWeekendDays(year, monthNum);
  const legalHolidays = getLegalHolidayCount(year, monthNum);
  const workDays = daysInMonth - saturdays - sundays - legalHolidays;

  // 统计所有排班表（主播+中控）里全职员工的出勤
  const anchorData = await collectScheduleHours(feishuToken, brand === "all" ? "all" : brand, "anchor", range, nicknameMapping);
  const controlData = await collectScheduleHours(feishuToken, brand === "all" ? "all" : brand, "control", range, nicknameMapping);

  // 合并
  const nameHours: Record<string, number> = {};
  const nameDays: Record<string, Set<string>> = {};
  const nameHolidayDays: Record<string, Set<string>> = {};
  for (const src of [anchorData, controlData]) {
    for (const [n, h] of Object.entries(src.nameHours)) nameHours[n] = (nameHours[n] || 0) + h;
    for (const [n, set] of Object.entries(src.nameDays)) {
      if (!nameDays[n]) nameDays[n] = new Set();
      set.forEach((d) => nameDays[n].add(d));
    }
    for (const [n, set] of Object.entries(src.nameHolidayDays)) {
      if (!nameHolidayDays[n]) nameHolidayDays[n] = new Set();
      set.forEach((d) => nameHolidayDays[n].add(d));
    }
  }

  const details: Array<{ name: string; base: number; subsidy: number; cost: number; role: string; hours: number; days: number }> = [];

  for (const [name, config] of Object.entries(fulltimeConfig)) {
    if (brand !== "all" && config.brand !== brand) continue;

    // 特殊：洪元媛/曾令飞 7月起才算全职
    const isFulltimeMonth =
      name === "洪元媛" || name === "曾令飞"
        ? year > 2026 || (year === 2026 && monthNum >= 7)
        : true;
    if (!isFulltimeMonth) continue;

    // 运营不参与排班
    if (config.role === "运营") {
      const socialInsurance = 1600;
      details.push({
        name,
        base: config.base,
        subsidy: config.subsidy,
        cost: config.base + config.subsidy + socialInsurance,
        role: config.role,
        hours: 0,
        days: 0,
      });
      continue;
    }

    const attendanceDays = nameDays[name]?.size || 0;
    const actualHours = nameHours[name] || 0;
    const holidayDays = nameHolidayDays[name]?.size || 0;

    const expectedHours = config.role === "主播" ? 90 : workDays * 8;

    // 主播加班费 170/h，中控加班费 35/h
    const otherSalary =
      config.role === "主播"
        ? Math.max(0, (actualHours - expectedHours) * 170)
        : Math.max(0, (actualHours - expectedHours) * 35);

    // 主播无法定节假日薪资
    const holidaySalary =
      config.role === "主播" ? 0 : (config.base / workDays) * holidayDays * 3;

    // 主播：底薪+补贴+加班费（不按出勤天折算）
    // 中控/其他：(底薪+补贴)/应出勤天数*实际出勤天数 + 加班费 + 节假日薪资
    const realTimeSalary =
      config.role === "主播"
        ? config.base + config.subsidy + otherSalary
        : (config.base + config.subsidy) / workDays * attendanceDays + otherSalary + holidaySalary;

    const socialInsurance = 1600;
    const tax = realTimeSalary * 0.0318;
    const totalCost = realTimeSalary + socialInsurance + tax;

    details.push({
      name,
      base: config.base,
      subsidy: config.subsidy,
      cost: totalCost,
      role: config.role,
      hours: actualHours,
      days: attendanceDays,
    });
  }

  return { total: details.reduce((s, d) => s + d.cost, 0), details };
}

// Dimension D: 采买成本（按日期范围）
async function calcPurchaseCost(
  feishuToken: string,
  brand: string,
  range: DateRange,
): Promise<{ total: number; details: Array<{ date: string; amount: number }> }> {
  let configs: Array<{ wikiToken: string; sheetId: string; purchaseCol: number }> = [];
  if (brand === "all") configs = Object.values(DATA_CONFIG);
  else if (brand === "iQOO") configs = [DATA_CONFIG["iQOO-ks"], DATA_CONFIG["iQOO-dy"]];
  else if (brand === "vivo") configs = [DATA_CONFIG.vivo];
  else if (brand === "IOT") configs = [DATA_CONFIG.IOT];
  else if (brand === "iQOO-ks") configs = [DATA_CONFIG["iQOO-ks"]];
  else if (brand === "iQOO-dy") configs = [DATA_CONFIG["iQOO-dy"]];

  const dailyCosts: Array<{ date: string; amount: number }> = [];

  for (const cfg of configs) {
    let sheetId = cfg.sheetId;
    if (!sheetId) sheetId = await getSheetIdFromWiki(feishuToken, cfg.wikiToken);

    const values = await readSheetFeishu(feishuToken, cfg.wikiToken, `${sheetId}!A1:K200`);
    if (!values.length) continue;

    const header = values[0];
    let dateCol = -1;
    let purchaseCol = -1;
    for (let i = 0; i < header.length; i++) {
      const h = String(header[i] || "").toLowerCase();
      if (h.includes("日期")) dateCol = i;
      if (h.includes("采买")) purchaseCol = i;
    }
    if (dateCol < 0 || purchaseCol < 0) continue;

    for (let row = 1; row < values.length; row++) {
      const rowData = values[row];
      const dateCell = rowData[dateCol];
      if (typeof dateCell === "number" && dateCell > 40000) {
        const date = parseExcelDate(dateCell);
        if (date >= range.start && date <= range.end) {
          const purchaseCell = rowData[purchaseCol];
          const amount = typeof purchaseCell === "number" ? purchaseCell : parseFloat(purchaseCell) || 0;
          if (amount > 0) dailyCosts.push({ date: localDateStr(date), amount });
        }
      }
    }
  }

  return { total: dailyCosts.reduce((s, d) => s + d.amount, 0), details: dailyCosts };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const responseCache = new Map<string, { data: unknown; expireAt: number }>();

function normalizeBrand(input: string): string {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  if (lower === "all") return "all";
  if (lower === "vivo") return "vivo";
  if (lower === "iqoo") return "iQOO";
  if (lower === "iot") return "IOT";
  return raw;
}

/** 本地日期格式化 YYYY-MM-DD，避免 toISOString() 时区偏移 */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateParam(s: string | null, endOfDay = false): Date | null {
  if (!s) return null;
  // 支持 YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || new Date().toISOString().substring(0, 7);
  const rawBrand = searchParams.get("brand") || "all";
  const brand = normalizeBrand(rawBrand);

  // 日期范围：startDate / endDate 优先；否则按 month 取整月
  let startDate = parseDateParam(searchParams.get("startDate"));
  let endDate = parseDateParam(searchParams.get("endDate"), true);
  if (!startDate || !endDate) {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    startDate = new Date(y, m - 1, 1, 0, 0, 0);
    endDate = new Date(y, m - 1, daysInMonth, 23, 59, 59);
  }
  const range: DateRange = { start: startDate, end: endDate };

  const rangeKey = `${localDateStr(startDate)}_${localDateStr(endDate)}`;
  const cacheKey = `${month}::${brand}::${rangeKey}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }

  try {
    const feishuToken = await getFeishuToken();
    const fulltimeConfig = await buildFulltimeConfig(feishuToken);
    const nicknameMapping = await buildNicknameMapping(feishuToken, fulltimeConfig);
    const anchorRates = await buildAnchorRates(feishuToken);

    const [anchorResult, controlResult, fulltimeResult, purchaseResult] = await Promise.all([
      calcAnchorCost(feishuToken, brand, range, nicknameMapping, anchorRates),
      calcControlCost(feishuToken, brand, range, nicknameMapping, fulltimeConfig),
      calcFulltimeCost(feishuToken, brand, range, fulltimeConfig, nicknameMapping),
      calcPurchaseCost(feishuToken, brand, range),
    ]);

    const totalCost = anchorResult.total + controlResult.total + fulltimeResult.total + purchaseResult.total;

    const byBrand: Record<string, number> = {};
    if (brand === "all") {
      const subBrands = ["vivo", "iQOO", "IOT"] as const;
      await Promise.all(
        subBrands.map(async (b) => {
          const [a, c, f, p] = await Promise.all([
            calcAnchorCost(feishuToken, b, range, nicknameMapping, anchorRates),
            calcControlCost(feishuToken, b, range, nicknameMapping, fulltimeConfig),
            calcFulltimeCost(feishuToken, b, range, fulltimeConfig, nicknameMapping),
            calcPurchaseCost(feishuToken, b, range),
          ]);
          byBrand[b] = a.total + c.total + f.total + p.total;
        }),
      );
    }

    const responseData = {
      month,
      brand,
      dateRange: {
        start: localDateStr(startDate),
        end: localDateStr(endDate),
      },
      dimensions: {
        anchor: { total: anchorResult.total, details: anchorResult.details },
        control: { total: controlResult.total, details: controlResult.details },
        fulltime: { total: fulltimeResult.total, details: fulltimeResult.details },
        purchase: { total: purchaseResult.total, details: purchaseResult.details },
      },
      totalCost,
      byBrand,
    };

    responseCache.set(cacheKey, { data: responseData, expireAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    console.error("Cost overview error:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
