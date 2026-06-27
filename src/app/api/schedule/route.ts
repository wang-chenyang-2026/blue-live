import { NextRequest, NextResponse } from 'next/server';

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';

// 排班表格配置
const SCHEDULE_CONFIG = {
  spreadsheetToken: 'HgdSwkq98iYiy5kgxVUcVe08n5f',
  sheetId: '5690e8',
  accounts: [
    { name: 'vivo（大号）', startRow: 3, endRow: 26 },
    { name: 'vivo官方旗舰店（抖音）', startRow: 30, endRow: 53 },
    { name: 'vivo官方旗舰店（快手）', startRow: 57, endRow: 80 },
  ],
  earlyMorningSlots: ['2-3点', '3-4点', '4-5点', '5-6点', '6-7点', '7-8点'],
  timeSlots: [
    '0-1点', '1-2点', '2-3点', '3-4点', '4-5点', '5-6点',
    '6-7点', '7-8点', '8-9点', '9-10点', '10-11点', '11-12点',
    '12-13点', '13-14点', '14-15点', '15-16点', '16-17点', '17-18点',
    '18-19点', '19-20点', '20-21点', '21-22点', '22-23点', '23-24点',
  ],
};

// 获取飞书 tenant_access_token
async function getFeishuToken(): Promise<string> {
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appSecret) throw new Error('FEISHU_APP_SECRET is not configured');
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: appSecret }),
  });
  const data = await response.json();
  if (data.code !== 0 || !data.tenant_access_token) throw new Error(`Failed to get token: ${data.msg}`);
  return data.tenant_access_token;
}

// 列索引转列名
function colToLetter(col: number): string {
  let name = '';
  let c = col;
  while (c >= 0) {
    name = String.fromCharCode((c % 26) + 65) + name;
    c = Math.floor(c / 26) - 1;
  }
  return name;
}

// 日期 → 列索引 (C=2 = 6月1日)
function dateToColIndex(dateStr: string): number {
  const base = new Date('2026-06-01');
  const target = new Date(dateStr);
  const diff = Math.floor((target.getTime() - base.getTime()) / (86400000));
  return 2 + diff;
}

// 解析人员名字和时长
function parsePerson(cellValue: string | null): { name: string; hours: number } | null {
  if (!cellValue || cellValue.trim() === '') return null;
  const trimmed = cellValue.trim();
  const match = trimmed.match(/^(.+?)(0\.5)?$/);
  if (match) {
    return { name: match[1].trim(), hours: match[2] === '0.5' ? 0.5 : 1 };
  }
  return { name: trimmed, hours: 1 };
}

// 读取飞书sheet一列数据
async function readColumn(token: string, colIndex: number, startRow: number, endRow: number): Promise<string[]> {
  const colName = colToLetter(colIndex);
  const range = `${colName}${startRow}:${colName}${endRow}`;
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${SCHEDULE_CONFIG.spreadsheetToken}/values/${SCHEDULE_CONFIG.sheetId}!${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (json.code !== 0 || !json.data?.valueRange?.values) return [];
  const values: string[][] = json.data.valueRange.values;
  return values.map(r => (r && r[0] ? String(r[0]) : ''));
}

// 处理单个账号一天的数据
function processAccountDay(cellValues: string[], startRow: number): {
  personSummary: { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number }[];
  stats: { personCount: number; totalHours: number; earlyMorningHours: number };
} {
  const personMap: Record<string, { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number }> = {};

  cellValues.forEach((cell, idx) => {
    const timeSlot = SCHEDULE_CONFIG.timeSlots[idx];
    if (!timeSlot) return;
    const personInfo = parsePerson(cell);
    if (!personInfo) return;

    const { name, hours } = personInfo;
    if (!personMap[name]) {
      personMap[name] = { name, timeSlots: [], totalHours: 0, earlyMorningHours: 0 };
    }
    personMap[name].timeSlots.push(timeSlot);
    personMap[name].totalHours += hours;
    if (SCHEDULE_CONFIG.earlyMorningSlots.includes(timeSlot)) {
      personMap[name].earlyMorningHours += hours;
    }
  });

  const personSummary = Object.values(personMap);
  const stats = {
    personCount: personSummary.length,
    totalHours: personSummary.reduce((s, p) => s + p.totalHours, 0),
    earlyMorningHours: personSummary.reduce((s, p) => s + p.earlyMorningHours, 0),
  };
  return { personSummary, stats };
}

// 生成日期列表
function getDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const s = new Date(start);
  const e = new Date(end);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// 格式化日期显示
function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 周${weekdays[d.getDay()]}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start') || searchParams.get('startDate');
    const end = searchParams.get('end') || searchParams.get('endDate');

    if (!start || !end) {
      return NextResponse.json({ success: false, error: 'start and end parameters are required' }, { status: 400 });
    }

    const dates = getDatesBetween(start, end);
    if (dates.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const token = await getFeishuToken();

    // 并行读取所有日期的列数据
    const colReads = dates.map(date => {
      const colIndex = dateToColIndex(date);
      // 读取整列 (row 3 to 80) 包含所有账号
      return readColumn(token, colIndex, 3, 80).then(values => ({ date, values }));
    });

    const colResults = await Promise.all(colReads);

    // 按日期分组处理
    const datesData = colResults.map(({ date, values }) => {
      const accounts = SCHEDULE_CONFIG.accounts.map(account => {
        const offset = account.startRow - 3; // 转为0-based索引
        const cellValues = values.slice(offset, offset + 24); // 24个时段
        const { personSummary, stats } = processAccountDay(cellValues, account.startRow);
        return {
          accountName: account.name,
          personSummary,
          stats,
        };
      });

      return {
        date,
        display: formatDateDisplay(date),
        accounts,
      };
    });

    // 全局汇总
    const globalStats = {
      totalPersonDays: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.personCount, 0), 0),
      totalHours: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.totalHours, 0), 0),
      totalEarlyMorning: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.earlyMorningHours, 0), 0),
      totalDays: dates.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        dates: datesData,
        globalStats,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
