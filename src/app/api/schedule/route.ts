import { NextRequest, NextResponse } from 'next/server';

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aad6eadc8d381cde';

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

// 时间段名称标准化：统一不同表格中的写法
function normalizeTimeSlot(slot: string): string {
  const s = slot.trim();
  // 处理各种不规范写法
  if (s === '24-1点' || s === '00-01点' || s === '0-1点') return '0-1点';
  if (s === '01-02点' || s === '1-2点') return '1-2点';
  if (s === '02-03点' || s === '2-3点') return '2-3点';
  if (s === '03-04点' || s === '3-4点') return '3-4点';
  if (s === '04-05点' || s === '4-5点') return '4-5点';
  if (s === '05-06点' || s === '5-6点') return '5-6点';
  if (s === '06-07点' || s === '6-7点') return '6-7点';
  if (s === '07-08点' || s === '7-8点') return '7-8点';
  if (s === '08-09点' || s === '8-9点') return '8-9点';
  if (s === '09-10点' || s === '9-10点') return '9-10点';
  if (s === '10-11点') return '10-11点';
  if (s === '11-12点') return '11-12点';
  if (s === '12-13点') return '12-13点';
  if (s === '13-14点') return '13-14点';
  if (s === '14-15点') return '14-15点';
  if (s === '15-16点') return '15-16点';
  if (s === '16-17点') return '16-17点';
  if (s === '17-18点') return '17-18点';
  if (s === '18-19点') return '18-19点';
  if (s === '19-20点') return '19-20点';
  if (s === '20-21点') return '20-21点';
  if (s === '21-22点') return '21-22点';
  if (s === '22-23点') return '22-23点';
  if (s === '23-24点') return '23-24点';
  return s;
}

// 获取飞书 tenant_access_token
async function getFeishuToken(): Promise<string> {
  const appSecret = process.env.FEISHU_APP_SECRET || 'ejUxI30c9sYDW1NWha0lqeABBMPYFZca';
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

// 解析人员名字和时长
// 格式1: "大白：0.75小时\n袁野：0.25小时" → 带时长标注的多人共播，按标注计入
// 格式2: "漫漫、发发" → 普通双播，各计1小时
// 格式3: "张三" / "张三0.5" → 单人，计1小时或0.5小时
function parsePerson(cellValue: string | null): { entries: Array<{ name: string; hours: number }>; isDual: boolean } | null {
  if (!cellValue || cellValue.trim() === '') return null;
  const trimmed = cellValue.trim();

  // 优先检测「姓名：X小时」格式（带换行的时长标注）
  const hasDurationAnnotation = /[:：]\s*[\d.]+\s*小时/.test(trimmed);
  if (hasDurationAnnotation) {
    const lines = trimmed.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    const entries: Array<{ name: string; hours: number }> = [];
    for (const line of lines) {
      const m = line.match(/^(.+?)\s*[:：]\s*([\d.]+)\s*小时?$/);
      if (m) {
        entries.push({ name: m[1].trim(), hours: parseFloat(m[2]) || 0 });
      }
    }
    if (entries.length > 0) {
      return { entries, isDual: false }; // 带时长标注的多人共播不计入双播，仅为常规时长
    }
  }

  // 检测 0.5 后缀
  const match = trimmed.match(/^(.+?)(0\.5)?$/);
  if (!match) return null;
  const content = match[1].trim();
  const hours = match[2] === '0.5' ? 0.5 : 1;
  // 中文顿号分隔双播（各计1小时）
  if (content.includes('、')) {
    const names = content.split('、').map(n => n.trim()).filter(n => n.length > 0);
    if (names.length > 1) {
      return { entries: names.map(n => ({ name: n, hours })), isDual: true };
    }
  }
  return { entries: [{ name: content, hours }], isDual: false };
}

// 读取飞书sheet一列数据（同时返回时间段标签）
async function readColumn(
  token: string,
  spreadsheetToken: string,
  sheetId: string,
  colIndex: number,
  startRow: number,
  endRow: number
): Promise<Array<{ timeSlot: string; value: string }>> {
  const colName = colToLetter(colIndex);
  const range = `${colName}${startRow}:${colName}${endRow}`;
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${range}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FormattedString`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (json.code !== 0 || !json.data?.valueRange?.values) return [];
  const values: string[][] = json.data.valueRange.values;

  // 同时读取 B 列获取时间段标签
  const bColName = 'B';
  const bRange = `${bColName}${startRow}:${bColName}${endRow}`;
  const bUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${bRange}?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FormattedString`;
  const bRes = await fetch(bUrl, { headers: { Authorization: `Bearer ${token}` } });
  const bJson = await bRes.json();
  const bValues: string[][] = bJson.data?.valueRange?.values || [];

  return values.map((r, idx) => ({
    timeSlot: bValues[idx] && bValues[idx][0] ? String(bValues[idx][0]) : '',
    value: r && r[0] ? String(r[0]) : '',
  }));
}

// 处理单个账号一天的数据
function processAccountDay(cellValues: Array<{ timeSlot: string; value: string }>): {
  personSummary: { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number }[];
  stats: { personCount: number; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number };
} {
  const personMap: Record<string, { name: string; timeSlots: string[]; totalHours: number; earlyMorningHours: number; dualBroadcastHours: number }> = {};
  const EARLY_MORNING_SLOTS = ['2-3点', '3-4点', '4-5点', '5-6点', '6-7点', '7-8点'];

  cellValues.forEach(({ timeSlot, value }) => {
    if (!timeSlot || !timeSlot.trim()) return;
    const normalizedSlot = normalizeTimeSlot(timeSlot);
    const personInfo = parsePerson(value);
    if (!personInfo) return;

    const { entries, isDual } = personInfo;
    const isEarlyMorning = EARLY_MORNING_SLOTS.includes(normalizedSlot);

    entries.forEach(({ name, hours }) => {
      if (!personMap[name]) {
        personMap[name] = { name, timeSlots: [], totalHours: 0, earlyMorningHours: 0, dualBroadcastHours: 0 };
      }
      personMap[name].timeSlots.push(normalizedSlot);
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