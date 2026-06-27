import { NextRequest, NextResponse } from 'next/server';

const SPREADSHEET_TOKEN = 'LdEIsmpHUhzGrXttf6gcYjWBnEN';

// Brand → Feishu sheet mapping. Only vivo has real sheets for now.
const BRAND_SHEET_MAP: Record<string, {
  dataSheet: string;
  dataRange: string;
  kpiSheet: string;
  kpiRange: string;
  kpiDailySheet: string;
  kpiDailyRange: string;
  subKpiSheet: string;
  subKpiRange: string;
  accounts: string[];
  brandLabel: string;
  color: string;
} | null> = {
  vivo: {
    dataSheet: '0a2100',
    dataRange: 'A1:G200',
    kpiSheet: '204xjT',
    kpiRange: 'A1:G6',
    kpiDailySheet: '204xjT',
    kpiDailyRange: 'H1:AL6',
    subKpiSheet: 'vcgTtP',
    subKpiRange: 'A1:F3',
    accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'],
    brandLabel: 'vivo',
    color: '#415FFF',
  },
  iqoo: null, // No Feishu sheets yet
  iot: null,  // No Feishu sheets yet
};

// Brand metadata for brands without Feishu data
const BRAND_META: Record<string, { accounts: string[]; brandLabel: string; color: string }> = {
  vivo: { accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'], brandLabel: 'vivo', color: '#415FFF' },
  iqoo: { accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'], brandLabel: 'iQOO', color: '#FF6B35' },
  iot: { accounts: ['IOT平板', 'IOT手表'], brandLabel: 'IOT', color: '#00C9A7' },
};

async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID || 'cli_aab083b6c2b99be3';
  const appSecret = process.env.FEISHU_APP_SECRET || '';

  if (!appSecret) {
    throw new Error('FEISHU_APP_SECRET environment variable is not set');
  }

  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    }
  );

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu auth failed: ${data.msg}`);
  }
  return data.tenant_access_token;
}

async function getSheetValues(
  token: string,
  sheetId: string,
  range: string
): Promise<string[][]> {
  const fullRange = `${sheetId}!${range}`;
  const encodedRange = encodeURIComponent(fullRange);
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${SPREADSHEET_TOKEN}/values/${encodedRange}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu sheet read failed: ${data.msg}`);
  }
  return data.data?.valueRange?.values || [];
}

function excelSerialToDate(serial: number | string): string {
  const num = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(num)) return String(serial);
  const date = new Date((num - 25569) * 86400 * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function excelSerialToISO(serial: number | string): string {
  const num = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(num)) return '';
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);
  return n.toLocaleString('zh-CN');
}

// Return empty data structure for brands without Feishu sheets
function emptyBrandData(brandKey: string) {
  const meta = BRAND_META[brandKey];
  if (!meta) return null;
  return {
    brandSummary: { gmv: '0', salesCount: '0', rawGmv: 0, rawSales: 0 },
    accountSummaries: meta.accounts.map((name) => ({
      accountName: name,
      gmv: '0',
      salesCount: '0',
      rawGmv: 0,
      rawSales: 0,
    })),
    dailyData: [],
    dailySummary: { duration: '0小时', gmv: '0', salesBeforeReturn: '0', salesAfterReturn: '0' },
    kpiData: [],
    subAccountKpi: [],
    kpiDailyRaw: [],
    kpiDailyDates: [],
    accounts: meta.accounts,
    brandLabel: meta.brandLabel,
    color: meta.color,
    hasData: false,
  };
}

// Fetch data for a single brand that has Feishu sheets
async function fetchBrandData(accessToken: string, brandKey: string) {
  const sheetConfig = BRAND_SHEET_MAP[brandKey];
  if (!sheetConfig) return emptyBrandData(brandKey);

  const [sheet1Raw, sheet2Raw, sheet3Raw, sheet2DailyRaw] = await Promise.all([
    getSheetValues(accessToken, sheetConfig.dataSheet, sheetConfig.dataRange),
    getSheetValues(accessToken, sheetConfig.kpiSheet, sheetConfig.kpiRange),
    getSheetValues(accessToken, sheetConfig.subKpiSheet, sheetConfig.subKpiRange),
    getSheetValues(accessToken, sheetConfig.kpiDailySheet, sheetConfig.kpiDailyRange),
  ]);

  // Process Sheet1 - daily data
  const dailyData: Array<{
    date: string;
    rawDate: string;
    accountName: string;
    duration: string;
    gmv: string;
    salesBeforeReturn: string;
    salesAfterReturn: string;
    rawGmv: number;
    rawSalesAfter: number;
    rawDuration: number;
  }> = [];

  for (let i = 1; i < sheet1Raw.length; i++) {
    const row = sheet1Raw[i];
    if (!row || row.length < 7) continue;

    const dateSerial = row[1];
    const accountName = row[2] || '';
    const duration = parseFloat(row[3]) || 0;
    const gmv = parseFloat(row[4]) || 0;
    const salesBefore = parseFloat(row[5]) || 0;
    const salesAfter = parseFloat(row[6]) || 0;

    dailyData.push({
      date: excelSerialToDate(dateSerial),
      rawDate: excelSerialToISO(dateSerial),
      accountName,
      duration: String(duration),
      gmv: formatNumber(gmv),
      salesBeforeReturn: formatNumber(salesBefore),
      salesAfterReturn: formatNumber(salesAfter),
      rawGmv: gmv,
      rawSalesAfter: salesAfter,
      rawDuration: duration,
    });
  }

  // Brand summary
  const totalGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
  const totalSales = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);
  const brandSummary = {
    gmv: formatNumber(totalGmv),
    salesCount: formatNumber(totalSales),
    rawGmv: totalGmv,
    rawSales: totalSales,
  };

  // Account summaries
  const accountSummaries = sheetConfig.accounts.map((name) => {
    const rows = dailyData.filter((d) => d.accountName === name);
    const gmv = rows.reduce((s, d) => s + d.rawGmv, 0);
    const sales = rows.reduce((s, d) => s + d.rawSalesAfter, 0);
    return {
      accountName: name,
      gmv: formatNumber(gmv),
      salesCount: formatNumber(sales),
      rawGmv: gmv,
      rawSales: sales,
    };
  });

  // KPI data
  function calcAverageFromRow(dailyRow: (string | number | null)[]): number {
    const nums = dailyRow
      .slice(1)
      .map((v) => (v === null || v === undefined ? NaN : parseFloat(String(v))))
      .filter((v) => !isNaN(v));
    if (nums.length === 0) return 0;
    return nums.reduce((s, v) => s + v, 0) / nums.length;
  }

  const kpiData: Array<{
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }> = [];

  for (let i = 1; i < sheet2Raw.length; i++) {
    const row = sheet2Raw[i];
    if (!row || row.length < 5) continue;

    const dimension = row[2] || '';
    const targetVal = parseFloat(row[4]) || 0;
    const dailyRow = sheet2DailyRaw[i] || [];
    const achievedVal = calcAverageFromRow(dailyRow);

    let rate = 0;
    if (targetVal > 0) {
      rate = achievedVal / targetVal;
    }

    let targetDisplay: string;
    let achievedDisplay: string;

    if (
      dimension.includes('率') ||
      dimension.includes('转粉') ||
      dimension.includes('观看')
    ) {
      targetDisplay = `${(targetVal * 100).toFixed(0)}%`;
      achievedDisplay = `${(achievedVal * 100).toFixed(2)}%`;
    } else if (dimension.includes('GPM')) {
      targetDisplay = formatNumber(targetVal);
      achievedDisplay = formatNumber(Math.round(achievedVal));
    } else if (dimension.includes('停留')) {
      targetDisplay = `${targetVal}秒`;
      achievedDisplay = `${achievedVal.toFixed(1)}秒`;
    } else {
      targetDisplay = String(targetVal);
      achievedDisplay = String(achievedVal);
    }

    kpiData.push({
      dimension,
      target: targetDisplay,
      achieved: achievedDisplay,
      rate: `${(rate * 100).toFixed(1)}%`,
      rawRate: rate,
      isLow: rate < 1,
    });
  }

  // Sub-account KPI
  const subAccountKpi: Array<{
    account: string;
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }> = [];

  for (let i = 1; i < sheet3Raw.length; i++) {
    const row = sheet3Raw[i];
    if (!row || row.length < 3) continue;

    const account = row[0] || '';
    const dimension = row[2] || '违规次数';
    const targetVal = parseFloat(row[4]) || 0;
    const achievedVal = parseFloat(row[5]) || 0;

    const rate =
      dimension.includes('违规') || targetVal === 0
        ? achievedVal === 0
          ? 1
          : 0
        : targetVal > 0
          ? achievedVal / targetVal
          : 0;

    subAccountKpi.push({
      account,
      dimension,
      target: `${targetVal}次`,
      achieved: `${achievedVal}次`,
      rate: `${(rate * 100).toFixed(0)}%`,
      rawRate: rate,
      isLow: rate < 1,
    });
  }

  // Summary row
  const summaryDuration = dailyData.reduce((s, d) => s + d.rawDuration, 0);
  const summaryGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
  const summarySalesAfter = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);

  // KPI daily raw for frontend date recalculation
  const kpiDailyRaw: number[][] = [];
  for (let i = 1; i < sheet2DailyRaw.length; i++) {
    const row = sheet2DailyRaw[i] || [];
    const nums = row
      .slice(1)
      .map((v) => (v === null || v === undefined ? NaN : parseFloat(String(v))));
    kpiDailyRaw.push(nums);
  }

  return {
    brandSummary,
    accountSummaries,
    dailyData,
    dailySummary: {
      duration: `${summaryDuration}小时`,
      gmv: formatNumber(summaryGmv),
      salesBeforeReturn: formatNumber(summaryGmv),
      salesAfterReturn: formatNumber(summarySalesAfter),
    },
    kpiData,
    subAccountKpi,
    kpiDailyRaw,
    kpiDailyDates: (sheet2DailyRaw[0] || [])
      .slice(1)
      .map((v) => excelSerialToISO(v)),
    accounts: sheetConfig.accounts,
    brandLabel: sheetConfig.brandLabel,
    color: sheetConfig.color,
    hasData: true,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand') || 'vivo';

    // If brand is 'all', fetch all brands
    if (brand === 'all') {
      const accessToken = await getTenantAccessToken();
      const brandKeys = ['vivo', 'iqoo', 'iot'];
      const results: Record<string, Awaited<ReturnType<typeof fetchBrandData>>> = {};

      for (const bk of brandKeys) {
        const sheetConfig = BRAND_SHEET_MAP[bk];
        if (sheetConfig) {
          results[bk] = await fetchBrandData(accessToken, bk);
        } else {
          results[bk] = emptyBrandData(bk);
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'all',
        data: results,
      });
    }

    // Single brand
    const sheetConfig = BRAND_SHEET_MAP[brand];
    if (!sheetConfig) {
      // Brand without Feishu data
      const emptyData = emptyBrandData(brand);
      if (!emptyData) {
        return NextResponse.json(
          { success: false, error: `Unknown brand: ${brand}` },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        mode: 'single',
        brand,
        data: emptyData,
      });
    }

    const accessToken = await getTenantAccessToken();
    const data = await fetchBrandData(accessToken, brand);

    return NextResponse.json({
      success: true,
      mode: 'single',
      brand,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
