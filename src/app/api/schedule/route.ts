import { NextRequest, NextResponse } from 'next/server';

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';

// 品牌排班表配置
interface SheetSource {
  spreadsheetToken: string;
  anchorSheetId: string;
  controlSheetId: string;
}

const BRAND_SOURCES: Record<string, SheetSource[]> = {
  vivo: [
    {
      spreadsheetToken: 'HgdSwkq98iYiy5kgxVUcVe08n5f',
      anchorSheetId: '5690e8',
      controlSheetId: '3xQ1Kq',
    },
  ],
  iqoo: [
    {
      spreadsheetToken: 'OjXIwcmMNidCrzk5G5OcWaFJnzg',
      anchorSheetId: '7fa2c2',
      controlSheetId: 'UyzPvX',
    },
    {
      spreadsheetToken: 'XSwFwf2tPi2SOzkEeGrcctZMn7c',
      anchorSheetId: '3efb46',
      controlSheetId: 'z2ln4e',
    },
  ],
};

// 凌晨班时段定义（2-8点）
const EARLY_MORNING_START_HOURS = new Set([2, 3, 4, 5, 6, 7]);

// ==================== 飞书API ====================

async function getFeishuToken(): Promise<string> {
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appSecret) {
    throw new Error('FEISHU_APP_SECRET is not configured');
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: FEISHU_APP_ID,
      app_secret: appSecret,
    }),
  });

  const data = await response.json();
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Failed to get token: ${data.msg}`);
  }

  return data.tenant_access_token;
}

async function readSheetData(
  token: string,
  spreadsheetToken: string,
  sheetId: string,
  range: string
): Promise<any[][]> {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${range}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  if (data.code !== 0 || !data.data?.valueRange?.values) {
    throw new Error(`Failed to read sheet: ${data.msg || 'unknown error'}`);
  }

  return data.data.valueRange.values;
}

// ==================== 解析工具 ====================

function getCellString(row: any[], colIndex: number): string {
  if (!row || colIndex >= row.length) return '';
  const cell = row[colIndex];
  if (!cell) return '';
  if (typeof cell === 'string') return cell;
  if (typeof cell === 'number') return String(cell);  // 支持 Excel 序列号（数字）
  if (typeof cell === 'object' && cell.value !== undefined) return String(cell.value);
  return '';
}

function getCellRawValue(row: any[], colIndex: number): any {
  if (!row || colIndex >= row.length) return null;
  const cell = row[colIndex];
  if (!cell) return null;
  if (typeof cell === 'object' && cell.value !== undefined) return cell.value;
  return cell;
}

function parseDateFromCell(value: any): Date | null {
  if (!value && value !== 0) return null;
  
  // Handle numeric Excel serial date (e.g., 46174 = 2026-06-01)
  if (typeof value === 'number') {
    // Excel epoch: 1900-01-01 = serial 1
    // But Excel incorrectly treats 1900 as leap year
    // For serial >= 1: date = UTC(1899, 11, 30 + serial)
    const date = new Date(Date.UTC(1899, 11, 30 + value));
    return date;
  }
  
  const str = String(value);
  if (!str) return null;

  // 支持 "2026年6月1日" 格式
  const match = str.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const day = parseInt(match[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(year, month, day);
    }
  }
  
  return null;
}

function isHeaderRow(row: any[]): boolean {
  const a = getCellString(row, 0).trim();
  const b = getCellString(row, 1).trim();
  // 支持 "项目"/"账号" 或 "时间"/"时间段" 作为 header 标识
  return a === '项目' || a === '账号' || b === '时间' || b === '时间段';
}

function isTimeSlotRow(row: any[]): boolean {
  const b = getCellString(row, 1).trim();
  return /^\d{1,2}[-–]\d{1,2}点$/.test(b);
}

function normalizeTimeSlot(raw: string): { display: string; startHour: number } {
  const s = raw.replace(/点$/, '').trim();
  const match = s.match(/^(\d+)[-–](\d+)$/);
  if (!match) return { display: raw, startHour: -1 };

  let start = parseInt(match[1]);
  let end = parseInt(match[2]);

  // 规范化: 24→0
  if (start >= 24) start = start - 24;

  return { display: `${start}-${end}点`, startHour: start };
}

function parsePersonInfo(cellValue: string | null): { name: string; hours: number } | null {
  if (!cellValue || cellValue.trim() === '') return null;

  const trimmed = cellValue.trim();
  const match = trimmed.match(/^(.+?)(0\.5)?$/);

  if (match) {
    const name = match[1].trim();
    const hasHalfHour = match[2] === '0.5';
    return { name, hours: hasHalfHour ? 0.5 : 1 };
  }

  return { name: trimmed, hours: 1 };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// ==================== 核心解析逻辑 ====================

interface AccountResult {
  name: string;
  schedules: {
    person: string;
    timeSlots: string[];
    totalHours: number;
    earlyMorningHours: number;
  }[];
}

function buildAccountResult(
  name: string,
  personMap: Record<string, { timeSlots: string[]; totalHours: number; earlyMorningHours: number }>
): AccountResult {
  const schedules = Object.entries(personMap).map(([person, data]) => ({
    person,
    timeSlots: data.timeSlots,
    totalHours: data.totalHours,
    earlyMorningHours: data.earlyMorningHours,
  }));

  // 按总时长降序排列
  schedules.sort((a, b) => b.totalHours - a.totalHours);

  return { name, schedules };
}

function parseSheetForDate(rows: any[][], targetDateStr: string): AccountResult[] {
  const targetDate = new Date(targetDateStr + 'T00:00:00');
  const targetKey = dateKey(targetDate);

  // Step 1: 找到 header 行，解析日期到列的映射
  const headerIndices: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (isHeaderRow(rows[i])) {
      headerIndices.push(i);
    }
  }

  if (headerIndices.length === 0) return [];

  // 从第一个 header 行解析日期列映射
  const headerRow = rows[headerIndices[0]];
  const colToDate = new Map<number, Date>();

  for (let j = 2; j < headerRow.length; j++) {
    const cellVal = getCellRawValue(headerRow, j);
    const date = parseDateFromCell(cellVal);
    if (date) {
      colToDate.set(j, date);
    }
  }

  if (colToDate.size === 0) return [];

  // 查找目标日期所在的列
  let targetCol = -1;
  for (const [colIdx, date] of colToDate.entries()) {
    if (dateKey(date) === targetKey) {
      targetCol = colIdx;
      break;
    }
  }

  if (targetCol === -1) return []; // 目标日期不在该表的范围内

  // Step 2: 遍历数据行，识别账号块并提取人员数据
  const accounts: AccountResult[] = [];
  let currentAccountName = '';
  let personMap: Record<string, { timeSlots: string[]; totalHours: number; earlyMorningHours: number }> = {};

  for (let i = 0; i < rows.length; i++) {
    // 跳过 header 行
    if (headerIndices.includes(i)) {
      // 先保存之前的账号
      if (currentAccountName) {
        accounts.push(buildAccountResult(currentAccountName, personMap));
        currentAccountName = '';
        personMap = {};
      }
      continue;
    }

    // 跳过 sub-header 行（header 的下一行，通常 B 列为空或非时间段）
    if (i > 0 && headerIndices.includes(i - 1)) continue;

    if (!isTimeSlotRow(rows[i])) continue;

    // 检查是否有新的账号名（col A 非空）
    const aVal = getCellString(rows[i], 0).trim().replace(/\n/g, '').replace(/\r/g, '');
    if (aVal) {
      // 保存之前的账号
      if (currentAccountName) {
        accounts.push(buildAccountResult(currentAccountName, personMap));
        personMap = {};
      }
      currentAccountName = aVal;
    }

    if (!currentAccountName) continue;

    // 获取时间段和人员信息
    const bVal = getCellString(rows[i], 1).trim();
    const { display, startHour } = normalizeTimeSlot(bVal);

    const personVal = getCellString(rows[i], targetCol);
    const personInfo = parsePersonInfo(personVal);

    if (personInfo) {
      if (!personMap[personInfo.name]) {
        personMap[personInfo.name] = { timeSlots: [], totalHours: 0, earlyMorningHours: 0 };
      }
      personMap[personInfo.name].timeSlots.push(display);
      personMap[personInfo.name].totalHours += personInfo.hours;
      if (EARLY_MORNING_START_HOURS.has(startHour)) {
        personMap[personInfo.name].earlyMorningHours += personInfo.hours;
      }
    }
  }

  // 保存最后一个账号
  if (currentAccountName) {
    accounts.push(buildAccountResult(currentAccountName, personMap));
  }

  return accounts;
}

// ==================== 主处理函数 ====================

async function processScheduleForBrand(
  token: string,
  date: string,
  brand: string,
  role: string
): Promise<AccountResult[]> {
  const sources = BRAND_SOURCES[brand];
  if (!sources) return [];

  const allAccounts: AccountResult[] = [];

  for (const source of sources) {
    const sheetId = role === 'control' ? source.controlSheetId : source.anchorSheetId;

    try {
      // 读取完整数据范围（A1:AO100 覆盖约41列x100行，支持iQOO快手从5月1日起算）
      const rows = await readSheetData(token, source.spreadsheetToken, sheetId, 'A1:AO100');
      const accounts = parseSheetForDate(rows, date);
      allAccounts.push(...accounts);
    } catch (error) {
      console.error(`Error reading sheet ${sheetId}:`, error);
    }
  }

  return allAccounts;
}

// ==================== API 路由 ====================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const brand = searchParams.get('brand') || 'vivo';
    const role = searchParams.get('role') || 'anchor';

    // 验证日期参数
    if (!date) {
      return NextResponse.json({ error: 'Date parameter is required' }, { status: 400 });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
    }

    // 验证品牌
    if (!['vivo', 'iqoo'].includes(brand)) {
      return NextResponse.json({ error: 'Invalid brand. Use vivo or iqoo' }, { status: 400 });
    }

    // 验证角色
    if (!['anchor', 'control'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Use anchor or control' }, { status: 400 });
    }

    // 获取飞书token
    const token = await getFeishuToken();

    // 获取排班数据
    const accounts = await processScheduleForBrand(token, date, brand, role);

    return NextResponse.json({
      date,
      brand,
      role,
      accounts,
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
