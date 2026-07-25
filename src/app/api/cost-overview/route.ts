import { NextRequest, NextResponse } from "next/server";

// Feishu API configuration
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aad6eadc8d381cde';
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || 'ejUyI30c9sYDW1NWha0lqeABBMPYFZca';
const SALARY_SHEET_TOKEN = "GFMyspTT3hsoemtkosbc1ObIn3Z";

// Salary management table for nickname → real name mapping
const NICKNAME_SHEET_TOKEN = "QmESw57otiab5WkLVqdcblCmnue";
const NICKNAME_SHEETS = {
  partTime: "b88f14",  // 兼职 sheet (A=姓名, B=花名)
  fullTime: "CxB4xa",  // 全职 sheet (A=所属项目, B=姓名)
};

// Schedule table configuration
const SCHEDULE_CONFIG = {
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

// Data table configuration (for purchase costs)
const DATA_CONFIG = {
  vivo: { wikiToken: "D2lOwohBDilDdgka9Ilc6U3xnib", sheetId: "0a2100", purchaseCol: 10 },
  "iQOO-ks": { wikiToken: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "RYPvqw", purchaseCol: 10 },
  "iQOO-dy": { wikiToken: "EEDWwUGZHiFy0Xk6fQAcjH9NnZd", sheetId: "0a2100", purchaseCol: 10 },
  IOT: { wikiToken: "H7cpwf3rwiDvGOkZVYlcqJASnaf", sheetId: "0a2100", purchaseCol: 10 },
};

// 2026 Legal holidays
const LEGAL_HOLIDAYS_2026: Record<string, string[]> = {
  "01": ["01", "02", "03"], // 元旦
  "02": ["15", "16", "17", "18", "19", "20", "21", "22", "23"], // 春节
  "04": ["04", "05", "06"], // 清明
  "05": ["01", "02", "03", "04", "05"], // 劳动节
  "06": ["19", "20", "21"], // 端午
  "09": ["25", "26", "27"], // 中秋
  "10": ["01", "02", "03", "04", "05", "06", "07"], // 国庆
};

// Part-time anchor hourly rates
const ANCHOR_RATES: Record<string, number> = {
  "潘天宇": 180, "潘玥": 180, "刘欣3649": 3649, "黄译漫": 180, "孟依凡": 180, "刘艾嘉": 180,
  "陈海容": 170, "范曦文": 170, "肖茜": 170, "陶春汝": 170, "施瑶瑶": 170,
  "宋晨悦": 160, "张佳慧": 160, "王迪": 160, "袁野": 160, "刘欣6549": 160, "郑美金": 160, "王欢": 160,
  "孙悦": 150, "詹琪琪": 150, "汪恒莉": 150, "张宁": 150,
};

// Full-time employee configuration
const FULLTIME_CONFIG: Record<string, { brand: string; base: number; subsidy: number; role: string }> = {
  "张厚羿": { brand: "vivo", base: 7000, subsidy: 500, role: "中控" },
  "刘慈航": { brand: "vivo", base: 6000, subsidy: 500, role: "中控" },
  "倪休": { brand: "iQOO", base: 8000, subsidy: 500, role: "运营" },
  "张睿": { brand: "iQOO", base: 12500, subsidy: 500, role: "运营" },
  "陈世杰": { brand: "vivo", base: 13000, subsidy: 500, role: "运营" },
  "高新权": { brand: "iQOO", base: 15000, subsidy: 500, role: "运营" },
  "袁智恒": { brand: "IOT", base: 6500, subsidy: 500, role: "运营" },
  "曲峰君": { brand: "IOT", base: 13500, subsidy: 0, role: "运营" },
  "洪元媛": { brand: "iQOO", base: 6000, subsidy: 500, role: "中控" }, // 7月转全职
  "曾令飞": { brand: "iQOO", base: 6000, subsidy: 500, role: "中控" }, // 7月转全职
  "石一淇": { brand: "vivo", base: 12000, subsidy: 500, role: "主播" },
};

// Helper: Get Feishu tenant access token
async function getFeishuToken(): Promise<string> {
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  });
  const data = await res.json();
  return data.tenant_access_token;
}

// Helper: Read Feishu sheet values
async function readSheet(token: string, sheetToken: string, range: string): Promise<string[][]> {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${sheetToken}/values/${range}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.data?.valueRange?.values || [];
}

// Helper: Get sheet ID from wiki token
async function getSheetIdFromWiki(token: string, wikiToken: string): Promise<string> {
  const url = `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${wikiToken}/sheets/query`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  const sheets = data.data?.sheets || [];
  return sheets[0]?.sheet_id || "";
}

// Helper: Parse date from Excel serial number
function parseExcelDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000);
}

// Helper: Strip numbers and trailing punctuation from name
function stripNumbers(name: string): string {
  return name.replace(/[0-9]/g, "").replace(/[.。·]/g, "").trim();
}

// Helper: Strip trailing non-Chinese characters from name (for salary table)
function cleanSalaryName(name: string): string {
  return name.replace(/[^\u4e00-\u9fa5]+$/, "").trim();
}

// Build nickname → real name mapping from salary table
// Returns: { 花名: 真实姓名, ... }
// Also returns reverse mapping: { 真实姓名: 真实姓名 } for direct lookups
async function buildNicknameMapping(feishuToken: string): Promise<{
  nicknameToReal: Record<string, string>;
  allNames: Set<string>;
}> {
  const nicknameToReal: Record<string, string> = {};
  const allNames = new Set<string>();

  try {
    // Read 兼职 sheet (A=姓名 with numbers, B=花名)
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

    // Read 全职 sheet (A=所属项目, B=姓名)
    const ftValues = await readSheet(feishuToken, NICKNAME_SHEET_TOKEN, `${NICKNAME_SHEETS.fullTime}!A1:B100`);
    for (let i = 1; i < ftValues.length; i++) {
      const project = String(ftValues[i][0] || "").trim();
      const name = String(ftValues[i][1] || "").trim();
      if (name && project) {
        allNames.add(name);
      }
    }
  } catch (e) {
    console.error("Failed to build nickname mapping:", e);
  }

  return { nicknameToReal, allNames };
}

// Resolve a name from schedule to real name using nickname mapping
// Priority: 1) direct match in allNames, 2) match as nickname, 3) return cleaned name
function resolveName(scheduleName: string, mapping: { nicknameToReal: Record<string, string>; allNames: Set<string> }): string {
  const cleaned = stripNumbers(scheduleName);
  
  // If it's already a known real name, return as-is
  if (mapping.allNames.has(cleaned)) {
    // Check if it's a nickname that maps to a different real name
    if (mapping.nicknameToReal[cleaned]) {
      return mapping.nicknameToReal[cleaned];
    }
    return cleaned;
  }
  
  // Try to match as nickname
  if (mapping.nicknameToReal[cleaned]) {
    return mapping.nicknameToReal[cleaned];
  }
  
  // Return cleaned name as fallback
  return cleaned;
}

// Helper: Check if string is a day-of-week label
function isDayLabel(name: string): boolean {
  return /^(星期|周|礼拜)[一二三四五六日天]$/.test(name);
}

// Helper: Check if date is a legal holiday
function isLegalHoliday(date: Date): boolean {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return LEGAL_HOLIDAYS_2026[month]?.includes(day) || false;
}

// Helper: Count Saturdays in a month
function countSaturdays(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    if (date.getDay() === 6) count++;
  }
  return count;
}

// Helper: Get legal holiday count in a month
function getLegalHolidayCount(year: number, month: number): number {
  const monthStr = String(month).padStart(2, "0");
  return LEGAL_HOLIDAYS_2026[monthStr]?.length || 0;
}

// Dimension A: Calculate part-time anchor cost
async function calcAnchorCost(
  feishuToken: string,
  month: string,
  brand: string,
  nicknameMapping?: { nicknameToReal: Record<string, string>; allNames: Set<string> }
): Promise<{ total: number; details: Array<{ name: string; hours: number; rate: number; cost: number }> }> {
  const [year, monthNum] = month.split("-").map(Number);
  const monthStr = String(monthNum).padStart(2, "0");
  
  // Get schedule data
  let schedules;
  if (brand === "all") {
    schedules = Object.values(SCHEDULE_CONFIG);
  } else if (brand === "iQOO") {
    schedules = [SCHEDULE_CONFIG["iQOO-ks"], SCHEDULE_CONFIG["iQOO-dy"]];
  } else {
    schedules = [SCHEDULE_CONFIG[brand as keyof typeof SCHEDULE_CONFIG]];
  }
  
  const nameHours: Record<string, number> = {};
  
  for (const schedule of schedules) {
    if (!schedule) continue;
    
    const values = await readSheet(feishuToken, schedule.wikiToken, `${schedule.anchorSheet}!A1:CV200`);
    if (!values.length) continue;
    
    // Parse header to find date columns
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
    
    // Parse schedule data (rows 2+)
    for (let row = 2; row < values.length; row++) {
      const rowData = values[row];
      for (const [colStr, date] of Object.entries(dateColMap)) {
        const col = parseInt(colStr);
        const cell = rowData[col];
        if (typeof cell === "string" && cell.trim()) {
          // Each cell represents 1 hour
          const names = cell.split(/[,，、]/).map(n => n.trim()).filter(Boolean);
          for (const name of names) {
            const cleanName = stripNumbers(name);
            // Resolve nickname to real name if mapping is available
            const resolvedName = nicknameMapping ? resolveName(cleanName, nicknameMapping) : cleanName;
            // Find matching anchor in rate table
            const matchedName = Object.keys(ANCHOR_RATES).find(
              k => stripNumbers(k) === resolvedName || k === resolvedName
            );
            if (matchedName) {
              nameHours[matchedName] = (nameHours[matchedName] || 0) + 1;
            }
          }
        }
      }
    }
  }
  
  // Calculate cost
  const details = Object.entries(nameHours).map(([name, hours]) => {
    const rate = ANCHOR_RATES[name] || 160; // Default rate
    return { name, hours, rate, cost: hours * rate };
  });
  
  const total = details.reduce((sum, d) => sum + d.cost, 0);
  return { total, details };
}

// Dimension B: Calculate part-time control cost
async function calcControlCost(
  feishuToken: string,
  month: string,
  brand: string,
  nicknameMapping?: { nicknameToReal: Record<string, string>; allNames: Set<string> }
): Promise<{ total: number; details: Array<{ name: string; hours: number; cost: number; mode: string }> }> {
  const [year, monthNum] = month.split("-").map(Number);
  
  let schedules;
  if (brand === "all") {
    schedules = Object.values(SCHEDULE_CONFIG);
  } else if (brand === "iQOO") {
    schedules = [SCHEDULE_CONFIG["iQOO-ks"], SCHEDULE_CONFIG["iQOO-dy"]];
  } else {
    schedules = [SCHEDULE_CONFIG[brand as keyof typeof SCHEDULE_CONFIG]];
  }
  
  const nameHours: Record<string, number> = {};
  
  for (const schedule of schedules) {
    if (!schedule) continue;
    
    const values = await readSheet(feishuToken, schedule.wikiToken, `${schedule.controlSheet}!A1:CV200`);
    if (!values.length) continue;
    
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
      for (const [colStr, date] of Object.entries(dateColMap)) {
        const col = parseInt(colStr);
        const cell = rowData[col];
        if (typeof cell === "string" && cell.trim()) {
          const names = cell.split(/[,，、]/).map(n => n.trim()).filter(Boolean);
          for (const name of names) {
            const cleanName = stripNumbers(name);
            // Resolve nickname to real name if mapping is available
            const resolvedName = nicknameMapping ? resolveName(cleanName, nicknameMapping) : cleanName;
            // Skip full-time employees and day labels
            if (resolvedName in FULLTIME_CONFIG) continue;
            if (isDayLabel(resolvedName)) continue;
            nameHours[resolvedName] = (nameHours[resolvedName] || 0) + 1;
          }
        }
      }
    }
  }
  
  // Calculate cost based on different modes
  const details = Object.entries(nameHours).map(([name, hours]) => {
    let cost = 0;
    let mode = "";
    
    // Mode A: 洪媛媛, 杨子洬
    if (name === "洪媛媛") {
      mode = "底薪5000";
      if (hours <= 150) {
        cost = hours >= 130 ? 5000 : 0;
      } else {
        cost = 5000 + (hours - 150) * 40;
      }
    } else if (name === "杨子洬") {
      mode = "底薪5000";
      if (hours <= 150) {
        cost = hours >= 130 ? 5000 : 0;
      } else {
        cost = 5000 + (hours - 150) * 35;
      }
    }
    // Mode B: 钟雨辰, 黄孝杰, 田晓辉
    else if (["钟雨辰", "黄孝杰", "田晓辉"].includes(name)) {
      mode = "纯时薪50/h";
      cost = hours * 50;
    }
    // Mode C: 曾令飞 (before July 2026)
    else if (name === "曾令飞") {
      const [y, m] = month.split("-").map(Number);
      if (y < 2026 || (y === 2026 && m < 7)) {
        mode = "混合";
        const daysInMonth = new Date(y, m, 0).getDate();
        cost = (5000 / 24) * (hours / 8) + 500 + Math.max(0, hours - 192) * 35;
      }
    }
    // Special: 卞云龙
    else if (name === "卞云龙") {
      mode = "特殊";
      if (hours <= 130) {
        cost = 5000;
      } else {
        cost = hours * 50;
      }
    }
    // Default: 50/h
    else {
      mode = "默认50/h";
      cost = hours * 50;
    }
    
    return { name, hours, cost, mode };
  });
  
  const total = details.reduce((sum, d) => sum + d.cost, 0);
  return { total, details };
}

// Dimension C: Calculate full-time employee cost
async function calcFulltimeCost(
  feishuToken: string,
  month: string,
  brand: string
): Promise<{ total: number; details: Array<{ name: string; base: number; subsidy: number; cost: number; role: string }> }> {
  const [year, monthNum] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const saturdays = countSaturdays(year, monthNum);
  const legalHolidays = getLegalHolidayCount(year, monthNum);
  const workDays = daysInMonth - saturdays - legalHolidays;
  
  // Get attendance data from schedule tables
  const nameAttendance: Record<string, { days: number; hours: number; holidayDays: number }> = {};
  
  const allSchedules = Object.values(SCHEDULE_CONFIG);
  for (const schedule of allSchedules) {
    // Check both anchor and control sheets
    for (const sheetId of [schedule.anchorSheet, schedule.controlSheet]) {
      const values = await readSheet(feishuToken, schedule.wikiToken, `${sheetId}!A1:CV200`);
      if (!values.length) continue;
      
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
        for (const [colStr, date] of Object.entries(dateColMap)) {
          const col = parseInt(colStr);
          const cell = rowData[col];
          if (typeof cell === "string" && cell.trim()) {
            const names = cell.split(/[,，、]/).map(n => n.trim()).filter(Boolean);
            for (const name of names) {
              const cleanName = stripNumbers(name);
              if (!nameAttendance[cleanName]) {
                nameAttendance[cleanName] = { days: 0, hours: 0, holidayDays: 0 };
              }
              // Track unique days
              const dateKey = date.toISOString().split("T")[0];
              nameAttendance[cleanName].hours += 1;
            }
          }
        }
      }
    }
  }
  
  // Calculate unique attendance days for each person
  const nameUniqueDays: Record<string, Set<string>> = {};
  for (const schedule of Object.values(SCHEDULE_CONFIG)) {
    for (const sheetId of [schedule.anchorSheet, schedule.controlSheet]) {
      const values = await readSheet(feishuToken, schedule.wikiToken, `${sheetId}!A1:H50`);
      if (!values.length) continue;
      
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
        for (const [colStr, date] of Object.entries(dateColMap)) {
          const col = parseInt(colStr);
          const cell = rowData[col];
          if (typeof cell === "string" && cell.trim()) {
            const names = cell.split(/[,，、]/).map(n => n.trim()).filter(Boolean);
            for (const name of names) {
              const cleanName = stripNumbers(name);
              if (!nameUniqueDays[cleanName]) {
                nameUniqueDays[cleanName] = new Set();
              }
              nameUniqueDays[cleanName].add(date.toISOString().split("T")[0]);
            }
          }
        }
      }
    }
  }
  
  // Filter by brand and calculate cost
  const details = Object.entries(FULLTIME_CONFIG)
    .filter(([_, config]) => {
      if (brand === "all") return true;
      return config.brand === brand;
    })
    .map(([name, config]) => {
      // Check if this person should be fulltime in this month
      const [y, m] = month.split("-").map(Number);
      const isFulltimeMonth = (name === "洪元媛" || name === "曾令飞") 
        ? (y > 2026 || (y === 2026 && m >= 7))
        : true;
      
      if (!isFulltimeMonth) return null;
      
      const attendanceDays = nameUniqueDays[name]?.size || 0;
      const actualHours = nameAttendance[name]?.hours || 0;
      
      let expectedHours = 0;
      if (config.role === "主播") {
        expectedHours = 90; // Fixed for anchors
      } else if (config.role === "运营") {
        expectedHours = 0; // Operations have 0 expected hours
      } else {
        expectedHours = workDays * 8;
      }
      
      // Calculate components
      const otherSalary = config.role === "主播"
        ? Math.max(0, (actualHours - expectedHours) * 170)
        : Math.max(0, (actualHours - expectedHours) * 35);
      
      const holidayDays = nameAttendance[name]?.holidayDays || 0;
      const holidaySalary = config.role === "主播" 
        ? 0 
        : (config.base / workDays) * holidayDays * 3;
      
      const realTimeSalary = config.role === "主播"
        ? (config.base + config.subsidy) / workDays * attendanceDays + otherSalary
        : (config.base + config.subsidy) / workDays * attendanceDays + otherSalary + holidaySalary;
      
      const socialInsurance = 1600 / daysInMonth * daysInMonth; // Simplified
      const tax = realTimeSalary * 0.0318;
      const totalCost = realTimeSalary + socialInsurance + tax;
      
      return {
        name,
        base: config.base,
        subsidy: config.subsidy,
        cost: totalCost,
        role: config.role,
      };
    })
    .filter(Boolean) as Array<{ name: string; base: number; subsidy: number; cost: number; role: string }>;
  
  const total = details.reduce((sum, d) => sum + d.cost, 0);
  return { total, details };
}

// Dimension D: Calculate purchase cost
async function calcPurchaseCost(
  feishuToken: string,
  month: string,
  brand: string
): Promise<{ total: number; details: Array<{ date: string; amount: number }> }> {
  const [year, monthNum] = month.split("-").map(Number);
  
  let dataConfigs;
  if (brand === "all") {
    dataConfigs = Object.values(DATA_CONFIG);
  } else if (brand === "iQOO") {
    dataConfigs = [DATA_CONFIG["iQOO-ks"], DATA_CONFIG["iQOO-dy"]];
  } else {
    dataConfigs = [DATA_CONFIG[brand as keyof typeof DATA_CONFIG]];
  }
  
  const dailyCosts: Array<{ date: string; amount: number }> = [];
  
  for (const config of dataConfigs) {
    if (!config) continue;
    
    let sheetId = config.sheetId;
    if (!sheetId) {
      sheetId = await getSheetIdFromWiki(feishuToken, config.wikiToken);
    }
    
    const values = await readSheet(feishuToken, config.wikiToken, `${sheetId}!A1:K100`);
    if (!values.length) continue;
    
    // Find date and purchase cost columns
    const header = values[0];
    let dateCol = -1;
    let purchaseCol = -1;
    
    for (let i = 0; i < header.length; i++) {
      const h = String(header[i] || "").toLowerCase();
      if (h.includes("日期")) dateCol = i;
      if (h.includes("采买")) purchaseCol = i;
    }
    
    if (dateCol < 0 || purchaseCol < 0) continue;
    
    // Parse data rows
    for (let row = 1; row < values.length; row++) {
      const rowData = values[row];
      const dateCell = rowData[dateCol];
      const purchaseCell = rowData[purchaseCol];
      
      let date: Date | null = null;
      if (typeof dateCell === "number" && dateCell > 40000) {
        date = parseExcelDate(dateCell);
      }
      
      if (date && date.getFullYear() === year && date.getMonth() + 1 === monthNum) {
        const amount = typeof purchaseCell === "number" ? purchaseCell : parseFloat(purchaseCell) || 0;
        if (amount > 0) {
          dailyCosts.push({
            date: date.toISOString().split("T")[0],
            amount,
          });
        }
      }
    }
  }
  
  const total = dailyCosts.reduce((sum, d) => sum + d.amount, 0);
  return { total, details: dailyCosts };
}

// In-memory cache: key = `${month}::${brand}`, value = { data, expireAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
type CachedEntry = { data: unknown; expireAt: number };
const responseCache = new Map<string, CachedEntry>();

// Normalize brand parameter: accept case-insensitive input
function normalizeBrand(input: string): string {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  if (lower === "all") return "all";
  if (lower === "vivo") return "vivo";
  if (lower === "iqoo") return "iQOO";
  if (lower === "iot") return "IOT";
  return raw; // fallback to raw for unknown values
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || new Date().toISOString().substring(0, 7);
  const rawBrand = searchParams.get("brand") || "all";
  const brand = normalizeBrand(rawBrand);
  
  // Check cache first
  const cacheKey = `${month}::${brand}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expireAt > Date.now()) {
    return NextResponse.json({ success: true, data: cached.data, cached: true });
  }
  
  try {
    const feishuToken = await getFeishuToken();
    
    // Build nickname → real name mapping from salary table
    const nicknameMapping = await buildNicknameMapping(feishuToken);
    
    // Calculate all dimensions
    const [anchorResult, controlResult, fulltimeResult, purchaseResult] = await Promise.all([
      calcAnchorCost(feishuToken, month, brand, nicknameMapping),
      calcControlCost(feishuToken, month, brand, nicknameMapping),
      calcFulltimeCost(feishuToken, month, brand),
      calcPurchaseCost(feishuToken, month, brand),
    ]);
    
    const totalCost = anchorResult.total + controlResult.total + fulltimeResult.total + purchaseResult.total;
    
    // Calculate by brand
    const byBrand: Record<string, number> = {};
    if (brand === "all") {
      const [vivoAnchor, vivoControl, vivoFulltime, vivoPurchase] = await Promise.all([
        calcAnchorCost(feishuToken, month, "vivo", nicknameMapping),
        calcControlCost(feishuToken, month, "vivo", nicknameMapping),
        calcFulltimeCost(feishuToken, month, "vivo"),
        calcPurchaseCost(feishuToken, month, "vivo"),
      ]);
      byBrand.vivo = vivoAnchor.total + vivoControl.total + vivoFulltime.total + vivoPurchase.total;
      
      const [iqooAnchor, iqooControl, iqooFulltime, iqooPurchase] = await Promise.all([
        calcAnchorCost(feishuToken, month, "iQOO", nicknameMapping),
        calcControlCost(feishuToken, month, "iQOO", nicknameMapping),
        calcFulltimeCost(feishuToken, month, "iQOO"),
        calcPurchaseCost(feishuToken, month, "iQOO"),
      ]);
      byBrand.iQOO = iqooAnchor.total + iqooControl.total + iqooFulltime.total + iqooPurchase.total;
      
      const [iotAnchor, iotControl, iotFulltime, iotPurchase] = await Promise.all([
        calcAnchorCost(feishuToken, month, "IOT", nicknameMapping),
        calcControlCost(feishuToken, month, "IOT", nicknameMapping),
        calcFulltimeCost(feishuToken, month, "IOT"),
        calcPurchaseCost(feishuToken, month, "IOT"),
      ]);
      byBrand.IOT = iotAnchor.total + iotControl.total + iotFulltime.total + iotPurchase.total;
    }
    
    const responseData = {
      month,
      brand,
      dimensions: {
        anchor: { total: anchorResult.total, details: anchorResult.details },
        control: { total: controlResult.total, details: controlResult.details },
        fulltime: { total: fulltimeResult.total, details: fulltimeResult.details },
        purchase: { total: purchaseResult.total, details: purchaseResult.details },
      },
      totalCost,
      byBrand,
    };
    
    // Cache the result for 5 minutes
    responseCache.set(cacheKey, {
      data: responseData,
      expireAt: Date.now() + CACHE_TTL_MS,
    });
    
    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error("Cost overview error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
