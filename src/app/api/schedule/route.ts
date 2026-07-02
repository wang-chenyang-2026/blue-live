import { NextRequest, NextResponse } from 'next/server';

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';

// 多品牌排班表格配置
const BRAND_CONFIGS: Record<string, {
  tables: Array<{
    spreadsheetToken: string;
    sheetId: string;
    baseDate: string; // 该表的基准日期（C列对应的日期）
    accounts: Array<{ name: string; displayName: string; startRow: number; endRow: number }>;
  }>;
}> = {
  vivo: {
    tables: [{
      spreadsheetToken: 'HgdSwkq98iYiy5kgxVUcVe08n5f',
      sheetId: '5690e8', // 主播表
      baseDate: '2026-06-01',
      accounts: [
        { name: 'vivo（大号）', displayName: 'vivo（大号）', startRow: 3, endRow: 26 },
        { name: 'vivo官方旗舰店（抖音）', displayName: 'vivo官方旗舰店（抖音）', startRow: 30, endRow: 53 },
        { name: 'vivo官方旗舰店（快手）', displayName: 'vivo官方旗舰店（快手）', startRow: 57, endRow: 80 },
      ],
    }],
  },
  iQOO: {
    tables: [
      {
        spreadsheetToken: 'XSwFwf2tPi2SOzkEeGrcctZMn7c',
        sheetId: '3efb46', // iQOO快手主播表
        baseDate: '2026-05-01',
        accounts: [
          { name: 'iQOO手机', displayName: 'iQOO手机（快手）', startRow: 3, endRow: 26 },
        ],
      },
      {
        spreadsheetToken: 'OjXIwcmMNidCrzk5G5OcWaFJnzg',
        sheetId: '7fa2c2', // iQOO抖音主播表
        baseDate: '2026-06-01',
        accounts: [
          { name: 'iQOO手机', displayName: 'iQOO手机（抖音）', startRow: 3, endRow: 26 },
          { name: 'iQOO官方旗舰店（抖音）', displayName: 'iQOO官方旗舰店（抖音）', startRow: 30, endRow: 53 },
        ],
      },
    ],
  },
};

// 中控表配置（与主播表结构一致，只是sheet不同）
const CONTROL_TABLE_CONFIGS: Record<string, typeof BRAND_CONFIGS[string]> = {
  vivo: {
    tables: [{
      spreadsheetToken: 'HgdSwkq98iYiy5kgxVUcVe08n5f',
      sheetId: '3xQ1Kq', // 中控表
      baseDate: '2026-06-01',
      accounts: [
        { name: 'vivo（大号）', displayName: 'vivo（大号）', startRow: 3, endRow: 26 },
        { name: 'vivo官方旗舰店（抖音）', displayName: 'vivo官方旗舰店（抖音）', startRow: 30, endRow: 53 },
        { name: 'vivo官方旗舰店（快手）', displayName: 'vivo官方旗舰店（快手）', startRow: 57, endRow: 80 },
      ],
    }],
  },
  iQOO: {
    tables: [
      {
        spreadsheetToken: 'XSwFwf2tPi2SOzkEeGrcctZMn7c',
        sheetId: 'z2ln4e', // iQOO快手中控表
        baseDate: '2026-05-01',
        accounts: [
          { name: 'iQOO手机', displayName: 'iQOO手机（快手）', startRow: 3, endRow: 26 },
        ],
      },
      {
        spreadsheetToken: 'OjXIwcmMNidCrzk5G5OcWaFJnzg',
        sheetId: 'UyzPvX', // iQOO抖音中控表
        baseDate: '2026-06-01',
        accounts: [
          { name: 'iQOO手机', displayName: 'iQOO手机（抖音）', startRow: 3, endRow: 26 },
          { name: 'iQOO官方旗舰店（抖音）', displayName: 'iQOO官方旗舰店（抖音）', startRow: 30, endRow: 53 },
        ],
      },
    ],
  },
};

const EARLY_MORNING_SLOTS = ['2-3点', '3-4点', '4-5点', '5-6点', '6-7点', '7-8点'];
const TIME_SLOTS = [
  '0-1点', '1-2点', '2-3点', '3-4点', '4-5点', '5-6点',
  '6-7点', '7-8点', '8-9点', '9-10点', '10-11点', '11-12点',
  '12-13点', '13-14点', '14-15点', '15-16点', '16-17点', '17-18点',
  '18-19点', '19-20点', '20-21点', '21-22点', '22-23点', '23-24点',
];

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

// 日期 → 列索引（根据基准日期计算）
function dateToColIndex(dateStr: string, baseDate: string): number {
  const base = new Date(baseDate);
  const target = new Date(dateStr);
  const diff = Math.floor((target.getTime() - base.getTime()) / (86400000));
  return 2 + diff; // C列 = index 2
}

// 解析人员名字和时长（支持双播："漫漫、发发" 拆分为两人）
function parsePerson(cellValue: string | null): { names: string[]; hours: number; isDual: boolean } | null {
  if (!cellValue || cellValue.trim() === '') return null;
  const trimmed = cellValue.trim();
  // 检测 0.5 后缀
  const match = trimmed.match(/^(.+?)(0\.5)?$/);
  if (!match) return null;
  const content = match[1].trim();
  const hours = match[2] === '0.5' ? 0.5 : 1;
  // 中文顿号分隔双播
  if (content.includes('、')) {
    const names = content.split('、').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length > 1) {
      return { names, hours, isDual: true };
    }
  }
  return { names: [content], hours, isDual: false };
}

// 读取飞书sheet一列数据
async function readColumn(
  token: string,
  spreadsheetToken: string,
  sheetId: string,
  colIndex: number,
  startRow: number,
  endRow: number
): Promise<string[]> {
  const colName = colToLetter(colIndex);
  const range = `${colName}${startRow}:${colName}${endRow}`;
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (json.code !== 0 || !json.data?.valueRange?.values) return [];
  const values: string[][] = json.data.valueRange.values;
  return values.map(r => (r && r[0] ? String(r[0]) : ''));
}

// 处理单个账号一天的数据
function processAccountDay(cellValues: string[]): {
  personSummary: { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number }[];
  stats: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number };
} {
  const personMap: Record<string, { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number }> = {};

  cellValues.forEach((cell, idx) => {
    const timeSlot = TIME_SLOTS[idx];
    if (!timeSlot) return;
    const personInfo = parsePerson(cell);
    if (!personInfo) return;

    const { names, hours, isDual } = personInfo;
    const isEarlyMorning = EARLY_MORNING_SLOTS.includes(timeSlot);

    names.forEach(name => {
      if (!personMap[name]) {
        personMap[name] = { name, timeSlots: [], totalHours: 0, earlyMorningHours: 0, dualBroadcastHours: 0 };
      }
      personMap[name].timeSlots.push(timeSlot);
      personMap[name].totalHours += hours;
      if (isEarlyMorning) {
        personMap[name].earlyMorningHours += hours;
      }
      if (isDual) {
        personMap[name].dualBroadcastHours += hours;
      }
    });
  });

  const personSummary = Object.values(personMap);
  const stats = {
    personCount: personSummary.length,
    totalHours: personSummary.reduce((s, p) => s + p.totalHours, 0),
    earlyMorningHours: personSummary.reduce((s, p) => s + p.earlyMorningHours, 0),
    dualBroadcastHours: personSummary.reduce((s, p) => s + p.dualBroadcastHours, 0),
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
    const brand = searchParams.get('brand') || 'vivo';
    const role = searchParams.get('role') || 'anchor'; // anchor=主播, control=中控

    if (!start || !end) {
      return NextResponse.json({ success: false, error: 'start and end parameters are required' }, { status: 400 });
    }

    // 根据角色选择配置
    const configMap = role === 'control' ? CONTROL_TABLE_CONFIGS : BRAND_CONFIGS;
    const brandConfig = configMap[brand];
    
    if (!brandConfig) {
      return NextResponse.json({ success: false, error: `Unknown brand: ${brand}` }, { status: 400 });
    }

    const dates = getDatesBetween(start, end);
    if (dates.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid date range' }, { status: 400 });
    }

    const token = await getFeishuToken();

    // 收集所有账号的数据
    const allAccountsMap: Record<string, {
      accountName: string;
      personSummary: { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number }[];
      stats: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number };
    }[]> = {};

    // 初始化每个日期的账号数据
    dates.forEach(date => {
      allAccountsMap[date] = [];
    });

    // 处理每个表格
    for (const table of brandConfig.tables) {
      // 计算该表覆盖的日期范围
      const tableBase = new Date(table.baseDate);
      const validDates = dates.filter(date => {
        const d = new Date(date);
        return d >= tableBase; // 只处理该表基准日期之后的日期
      });

      if (validDates.length === 0) continue;

      // 并行读取该表所有日期的列数据
      const colReads = validDates.map(date => {
        const colIndex = dateToColIndex(date, table.baseDate);
        const maxRow = Math.max(...table.accounts.map(a => a.endRow));
        return readColumn(token, table.spreadsheetToken, table.sheetId, colIndex, 3, maxRow)
          .then(values => ({ date, values }));
      });

      const colResults = await Promise.all(colReads);

      // 处理每个日期的数据
      for (const { date, values } of colResults) {
        const accountDataList = table.accounts.map(account => {
          const offset = account.startRow - 3;
          const cellValues = values.slice(offset, offset + 24);
          const { personSummary, stats } = processAccountDay(cellValues);
          return {
            accountName: account.displayName,
            personSummary,
            stats,
          };
        });
        allAccountsMap[date] = [...allAccountsMap[date], ...accountDataList];
      }
    }

    // 构建按日期分组的数据
    const datesData = dates.map(date => ({
      date,
      display: formatDateDisplay(date),
      accounts: allAccountsMap[date] || [],
    }));

    // 全局汇总
    const globalStats = {
      totalPersonDays: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.personCount, 0), 0),
      totalHours: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.totalHours, 0), 0),
      totalEarlyMorning: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.earlyMorningHours, 0), 0),
      totalDualBroadcast: datesData.reduce((s, d) => s + d.accounts.reduce((a, acc) => a + acc.stats.dualBroadcastHours, 0), 0),
      totalDays: dates.length,
    };

    return NextResponse.json({
      success: true,
      data: {
        dates: datesData,
        globalStats,
        brand,
        role,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
