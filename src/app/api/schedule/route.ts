import { NextRequest, NextResponse } from 'next/server';

// 飞书API配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';

// 排班表格配置
const SCHEDULE_CONFIG = {
  spreadsheetToken: 'HgdSwkq98iYiy5kgxVUcVe08n5f',
  sheetId: '5690e8',
  // 账号行范围配置
  accounts: [
    {
      name: 'vivo（大号）',
      startRow: 3,  // Excel行号（第3行=0-1点）
      endRow: 26,   // Excel行号（第26行=23-24点）
    },
    {
      name: 'vivo官方旗舰店（抖音）',
      startRow: 30,
      endRow: 53,
    },
    {
      name: 'vivo官方旗舰店（快手）',
      startRow: 57,
      endRow: 80,
    },
  ],
  // 时间段配置：凌晨2-8点（2-3点到7-8点）
  earlyMorningSlots: ['2-3点', '3-4点', '4-5点', '5-6点', '6-7点', '7-8点'],
};

// 获取飞书 tenant_access_token
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

// 读取表格数据
async function readSheetData(token: string, spreadsheetToken: string, sheetId: string, range: string) {
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!${range}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.json();
}

// 计算日期对应的列索引
// C列(index 2) = 6月1日
// 日期映射：给定日期，计算距离6月1日的天数，列index = 2 + 天数差
function dateToColumnIndex(dateStr: string): number {
  const baseDate = new Date('2026-06-01');
  const targetDate = new Date(dateStr);
  const diffTime = targetDate.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  // C列是索引2，6月1日对应diffDays=0
  return 2 + diffDays;
}

// 列索引转换为Excel列名
function columnIndexToName(index: number): string {
  let colName = '';
  while (index >= 0) {
    colName = String.fromCharCode((index % 26) + 65) + colName;
    index = Math.floor(index / 26) - 1;
  }
  return colName;
}

// 计算指定日期对应的列范围
function getColumnRangeForDate(dateStr: string): string {
  const colIndex = dateToColumnIndex(dateStr);
  const colName = columnIndexToName(colIndex);
  return `${colName}3:${colName}80`; // 读取所有账号的时间段行
}

// 解析人员名字和时长
// 普通名字如"张宁"算1小时
// 带0.5的名字如"发发0.5"算0.5小时
function parsePersonInfo(cellValue: string | null): { name: string; hours: number } | null {
  if (!cellValue || cellValue.trim() === '') {
    return null;
  }

  const trimmed = cellValue.trim();
  const match = trimmed.match(/^(.+?)(0\.5)?$/);
  
  if (match) {
    const name = match[1].trim();
    const hasHalfHour = match[2] === '0.5';
    return {
      name,
      hours: hasHalfHour ? 0.5 : 1,
    };
  }

  return { name: trimmed, hours: 1 };
}

// 处理排班数据
async function processScheduleData(token: string, dateStr: string) {
  try {
    // 计算日期对应的列
    const colIndex = dateToColumnIndex(dateStr);
    const colName = columnIndexToName(colIndex);
    
    // 读取该日期列的所有时间段数据（从第3行到第80行）
    const range = `${colName}3:${colName}80`;
    const data = await readSheetData(token, SCHEDULE_CONFIG.spreadsheetToken, SCHEDULE_CONFIG.sheetId, range);

    if (data.code !== 0 || !data.data?.valueRange?.values) {
      return null;
    }

    const values = data.data.valueRange.values;

    // 处理每个账号的数据
    const accounts = SCHEDULE_CONFIG.accounts.map(account => {
      // 人员汇总数据结构
      const personMap: Record<string, {
        timeSlots: string[],
        totalHours: number,
        earlyMorningHours: number,
      }> = {};

      // 遍历该账号的所有时间段行
      for (let rowIndex = account.startRow - 3; rowIndex <= account.endRow - 3; rowIndex++) {
        if (rowIndex < 0 || rowIndex >= values.length) continue;

        const row = values[rowIndex];
        if (!row || row.length < 1) continue;

        // 获取时间段（从B列读取，但这里我们根据行号推算）
        const timeSlotIndex = rowIndex - (account.startRow - 3);
        const timeSlots = [
          '0-1点', '1-2点', '2-3点', '3-4点', '4-5点', '5-6点',
          '6-7点', '7-8点', '8-9点', '9-10点', '10-11点', '11-12点',
          '12-13点', '13-14点', '14-15点', '15-16点', '16-17点', '17-18点',
          '18-19点', '19-20点', '20-21点', '21-22点', '22-23点', '23-24点'
        ];
        const timeSlot = timeSlots[timeSlotIndex];
        if (!timeSlot) continue;

        // 获取该单元格的人员信息
        const cellValue = row[0];
        const personInfo = parsePersonInfo(cellValue);

        if (personInfo) {
          const { name, hours } = personInfo;

          if (!personMap[name]) {
            personMap[name] = {
              timeSlots: [],
              totalHours: 0,
              earlyMorningHours: 0,
            };
          }

          personMap[name].timeSlots.push(timeSlot);
          personMap[name].totalHours += hours;

          // 判断是否是凌晨班（2-3点到7-8点）
          if (SCHEDULE_CONFIG.earlyMorningSlots.includes(timeSlot)) {
            personMap[name].earlyMorningHours += hours;
          }
        }
      }

      // 转换为数组输出
      const personSummary = Object.entries(personMap).map(([name, info]) => ({
        name,
        timeSlots: info.timeSlots,
        totalHours: info.totalHours,
        earlyMorningHours: info.earlyMorningHours,
      }));

      // 汇总统计
      const totalHours = personSummary.reduce((sum, p) => sum + p.totalHours, 0);
      const totalEarlyMorningHours = personSummary.reduce((sum, p) => sum + p.earlyMorningHours, 0);

      return {
        accountName: account.name,
        date: dateStr,
        personSummary,
        stats: {
          personCount: personSummary.length,
          totalHours,
          earlyMorningHours: totalEarlyMorningHours,
        },
      };
    });

    return { accounts };
  } catch (error) {
    console.error('Error processing schedule data:', error);
    return null;
  }
}

// 处理日期范围排班数据
async function processScheduleRange(token: string, startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return null;
  }

  // 收集日期范围内所有日期
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const colIndex = dateToColumnIndex(dateStr);
    // 检查列索引是否在有效范围内（C列到AF列，index 2-37）
    if (colIndex >= 2 && colIndex <= 37) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }

  if (dates.length === 0) {
    return null;
  }

  // 一次性读取所有需要的列数据
  // 从C列(index 2)到AF列(index 37)，即6月1日到7月7日
  const firstColIndex = dateToColumnIndex(dates[0]);
  const lastColIndex = dateToColumnIndex(dates[dates.length - 1]);
  const firstColName = columnIndexToName(firstColIndex);
  const lastColName = columnIndexToName(lastColIndex);
  
  // 读取B列(时间段)和所有日期列的数据
  const range = `B3:${lastColName}80`;
  const data = await readSheetData(token, SCHEDULE_CONFIG.spreadsheetToken, SCHEDULE_CONFIG.sheetId, range);

  if (data.code !== 0 || !data.data?.valueRange?.values) {
    return null;
  }

  const values = data.data.valueRange.values;
  const timeSlotLabels = [
    '0-1点', '1-2点', '2-3点', '3-4点', '4-5点', '5-6点',
    '6-7点', '7-8点', '8-9点', '9-10点', '10-11点', '11-12点',
    '12-13点', '13-14点', '14-15点', '15-16点', '16-17点', '17-18点',
    '18-19点', '19-20点', '20-21点', '21-22点', '22-23点', '23-24点'
  ];

  // 处理每个账号
  const accounts = SCHEDULE_CONFIG.accounts.map(account => {
    // 人员跨天汇总
    const personMap: Record<string, {
      days: Record<string, string[]>,  // date -> timeSlots
      totalHours: number,
      earlyMorningHours: number,
    }> = {};

    // 每日排班网格
    const dailyGrid: Record<string, { timeSlot: string; persons: string[] }[]> = {};

    for (const dateStr of dates) {
      const colOffset = dateToColumnIndex(dateStr) - firstColIndex + 1; // +1 because B is col 0
      
      dailyGrid[dateStr] = [];

      for (let slotIdx = 0; slotIdx < 24; slotIdx++) {
        const rowIndex = account.startRow - 3 + slotIdx;
        if (rowIndex < 0 || rowIndex >= values.length) continue;

        const row = values[rowIndex];
        if (!row || colOffset < 0 || colOffset >= row.length) continue;

        const cellValue = row[colOffset];
        const personInfo = parsePersonInfo(cellValue);

        const timeSlot = timeSlotLabels[slotIdx];

        if (personInfo) {
          const { name, hours } = personInfo;

          if (!personMap[name]) {
            personMap[name] = { days: {}, totalHours: 0, earlyMorningHours: 0 };
          }

          if (!personMap[name].days[dateStr]) {
            personMap[name].days[dateStr] = [];
          }

          personMap[name].days[dateStr].push(timeSlot);
          personMap[name].totalHours += hours;

          if (SCHEDULE_CONFIG.earlyMorningSlots.includes(timeSlot)) {
            personMap[name].earlyMorningHours += hours;
          }

          dailyGrid[dateStr].push({ timeSlot, persons: [name] });
        }
      }
    }

    // 转换人员汇总为数组
    const personSummary = Object.entries(personMap).map(([name, info]) => ({
      name,
      days: info.days,
      totalHours: info.totalHours,
      earlyMorningHours: info.earlyMorningHours,
    }));

    const totalHours = personSummary.reduce((sum, p) => sum + p.totalHours, 0);
    const totalEarlyMorningHours = personSummary.reduce((sum, p) => sum + p.earlyMorningHours, 0);

    return {
      accountName: account.name,
      dateRange: dates,
      personSummary,
      dailyGrid,
      stats: {
        personCount: personSummary.length,
        totalHours,
        earlyMorningHours: totalEarlyMorningHours,
        coveredDays: dates.length,
      },
    };
  });

  return { accounts, dateRange: dates };
}

// 读取排班表头部日期信息
async function getScheduleDates(token: string) {
  // 读取第一行的日期信息（C1:AF1）
  const data = await readSheetData(token, SCHEDULE_CONFIG.spreadsheetToken, SCHEDULE_CONFIG.sheetId, 'C1:AF1');

  if (data.code !== 0 || !data.data?.valueRange?.values) {
    return [];
  }

  const values = data.data.valueRange.values[0] || [];
  
  return values.map((v: string | null, index: number) => {
    if (!v) return null;
    const serial = parseFloat(v);
    if (isNaN(serial)) return null;
    // Excel日期序列号转日期
    const date = new Date((serial - 25569) * 86400 * 1000);
    return {
      date: date.toISOString().split('T')[0],
      columnIndex: index + 2, // C列开始
    };
  }).filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const token = await getFeishuToken();
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const date = searchParams.get('date');

    if (date) {
      // 单日排班查询
      const result = await processScheduleData(token, date);
      if (!result) {
        return NextResponse.json({ success: false, error: 'No data found for the specified date' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: result });
    }

    if (startDate && endDate) {
      // 日期范围排班查询
      const result = await processScheduleRange(token, startDate, endDate);
      if (!result) {
        return NextResponse.json({ success: false, error: 'No data found for the specified date range' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: result });
    }

    // 默认：获取可用日期列表
    const dates = await getScheduleDates(token);
    return NextResponse.json({ success: true, data: { availableDates: dates } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
