import { NextRequest, NextResponse } from 'next/server';

/* ========== Spreadsheet Tokens ========== */
const VIVO_TOKEN = 'LdEIsmpHUhzGrXttf6gcYjWBnEN';
const IQOO_TOKEN = 'H9X8sWoVghiibztwTJYcLcFKnZe';
const IOT_TOKEN = 'Q2yhsobZvh32JptLPlNc0RMWnTc';

/* ========== Brand Config ========== */
interface DailySheetSource {
  spreadsheetToken: string;
  sheetId: string;
  range: string;
}

interface KpiSheetSource {
  spreadsheetToken: string;
  sheetId: string;
  range: string;
}

interface BrandSheetConfig {
  dailySheets: DailySheetSource[];       // Multiple daily data sheets to merge
  kpiMainSheet: KpiSheetSource | null;   // Main account KPI (like vivo大号)
  kpiMainDailySheet: KpiSheetSource | null; // Daily raw data for main KPI calc
  kpiSubSheets: KpiSheetSource[];        // Sub-account KPI sheets
  accounts: string[];
  brandLabel: string;
  color: string;
  mainKpiLabel: string;                  // Label for main KPI tab, e.g. "vivo（大号）KPI"
}

const BRAND_SHEET_MAP: Record<string, BrandSheetConfig> = {
  vivo: {
    dailySheets: [
      { spreadsheetToken: VIVO_TOKEN, sheetId: '0a2100', range: 'A1:G200' },
    ],
    kpiMainSheet: { spreadsheetToken: VIVO_TOKEN, sheetId: '204xjT', range: 'A1:G6' },
    kpiMainDailySheet: { spreadsheetToken: VIVO_TOKEN, sheetId: '204xjT', range: 'H1:AL6' },
    kpiSubSheets: [
      { spreadsheetToken: VIVO_TOKEN, sheetId: 'vcgTtP', range: 'A1:F3' },
    ],
    accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'],
    brandLabel: 'vivo',
    color: '#415FFF',
    mainKpiLabel: 'vivo（大号）KPI',
  },
  iqoo: {
    // iQOO抖音数据 + iQOO快手数据
    dailySheets: [
      { spreadsheetToken: IQOO_TOKEN, sheetId: '0a2100', range: 'A1:G200' },   // 数据iQOO抖音
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'RYPvqw', range: 'A1:G200' },   // 数据iQOO快手
    ],
    // iQOO手机抖音KPI
    kpiMainSheet: { spreadsheetToken: IQOO_TOKEN, sheetId: '204xjT', range: 'A1:G6' },
    kpiMainDailySheet: { spreadsheetToken: IQOO_TOKEN, sheetId: '204xjT', range: 'H1:AL6' },
    // Sub-account KPI: iQOO官方旗舰店抖音 + iQOO官方旗舰店快手
    kpiSubSheets: [
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'vcgTtP', range: 'A1:F3' },     // iQOO官方旗舰店抖音KPI
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'XXnMYT', range: 'A1:F3' },     // iQOO官方旗舰店快手KPI
    ],
    accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'],
    brandLabel: 'iQOO',
    color: '#FF6B35',
    mainKpiLabel: 'iQOO手机（抖音）KPI',
  },
  iot: {
    // IOT平板数据 + IOT手表数据
    dailySheets: [
      { spreadsheetToken: IOT_TOKEN, sheetId: '0a2100', range: 'A1:G200' },    // 数据IOT平板
      { spreadsheetToken: IOT_TOKEN, sheetId: 'RYPvqw', range: 'A1:G200' },    // 数据IOT手表
    ],
    // IOT平板KPI
    kpiMainSheet: { spreadsheetToken: IOT_TOKEN, sheetId: '204xjT', range: 'A1:G6' },
    kpiMainDailySheet: { spreadsheetToken: IOT_TOKEN, sheetId: '204xjT', range: 'H1:AL6' },
    // Sub-account KPI: IOT手表
    kpiSubSheets: [
      { spreadsheetToken: IOT_TOKEN, sheetId: 'XXnMYT', range: 'A1:F3' },      // IOT手表KPI
    ],
    accounts: ['IOT平板', 'IOT手表'],
    brandLabel: 'IOT',
    color: '#00C9A7',
    mainKpiLabel: 'IOT平板KPI',
  },
};

// Brand metadata fallback
const BRAND_META: Record<string, { accounts: string[]; brandLabel: string; color: string; mainKpiLabel: string }> = {
  vivo: { accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'], brandLabel: 'vivo', color: '#415FFF', mainKpiLabel: 'vivo（大号）KPI' },
  iqoo: { accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'], brandLabel: 'iQOO', color: '#FF6B35', mainKpiLabel: 'iQOO手机（抖音）KPI' },
  iot: { accounts: ['IOT平板', 'IOT手表'], brandLabel: 'IOT', color: '#00C9A7', mainKpiLabel: 'IOT平板KPI' },
};

/* ========== Feishu API Helpers ========== */
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
  spreadsheetToken: string,
  sheetId: string,
  range: string
): Promise<string[][]> {
  const fullRange = `${sheetId}!${range}`;
  const encodedRange = encodeURIComponent(fullRange);
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu sheet read failed (${spreadsheetToken}/${sheetId}): ${data.msg}`);
  }
  return data.data?.valueRange?.values || [];
}

/* ========== Data Helpers ========== */
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

function calcAverageFromRow(dailyRow: (string | number | null | undefined)[]): number {
  const nums = dailyRow
    .slice(1)
    .map((v) => (v === null || v === undefined ? NaN : parseFloat(String(v))))
    .filter((v) => !isNaN(v));
  if (nums.length === 0) return 0;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

/* ========== Parse Daily Data from Raw Sheet ========== */
function parseDailyData(raw: string[][]): Array<{
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
}> {
  const result: Array<{
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

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.length < 7) continue;

    const dateSerial = row[1];
    const accountName = row[2] || '';
    const duration = parseFloat(row[3]) || 0;
    const gmv = parseFloat(row[4]) || 0;
    const salesBefore = parseFloat(row[5]) || 0;
    const salesAfter = parseFloat(row[6]) || 0;

    result.push({
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
  return result;
}

/* ========== Parse KPI Data from Raw Sheet ========== */
function parseKpiData(sheet2Raw: string[][], sheet2DailyRaw: string[][]): Array<{
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  rawRate: number;
  isLow: boolean;
}> {
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
  return kpiData;
}

/* ========== Parse Sub-Account KPI from Raw Sheet ========== */
function parseSubAccountKpi(raw: string[][]): Array<{
  account: string;
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  rawRate: number;
  isLow: boolean;
}> {
  const result: Array<{
    account: string;
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }> = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
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

    result.push({
      account,
      dimension,
      target: `${targetVal}次`,
      achieved: `${achievedVal}次`,
      rate: `${(rate * 100).toFixed(0)}%`,
      rawRate: rate,
      isLow: rate < 1,
    });
  }
  return result;
}

/* ========== Empty Data Fallback ========== */
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
    mainKpiLabel: meta.mainKpiLabel,
    hasData: false,
  };
}

/* ========== Fetch Brand Data ========== */
async function fetchBrandData(accessToken: string, brandKey: string) {
  const config = BRAND_SHEET_MAP[brandKey];
  if (!config) return emptyBrandData(brandKey);

  // 1. Fetch all daily data sheets in parallel, then merge
  const dailyRawResults = await Promise.all(
    config.dailySheets.map((src) =>
      getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.range)
    )
  );
  const dailyData = dailyRawResults.flatMap((raw) => parseDailyData(raw));

  // 2. Fetch main KPI sheet + daily KPI sheet (if exists)
  let kpiData: Array<{
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }> = [];
  let kpiDailyRaw: number[][] = [];
  let kpiDailyDates: string[] = [];

  if (config.kpiMainSheet) {
    const [kpiMainRaw, kpiDailyRawSheet] = await Promise.all([
      getSheetValues(
        accessToken,
        config.kpiMainSheet.spreadsheetToken,
        config.kpiMainSheet.sheetId,
        config.kpiMainSheet.range
      ),
      config.kpiMainDailySheet
        ? getSheetValues(
            accessToken,
            config.kpiMainDailySheet.spreadsheetToken,
            config.kpiMainDailySheet.sheetId,
            config.kpiMainDailySheet.range
          )
        : Promise.resolve([]),
    ]);

    kpiData = parseKpiData(kpiMainRaw, kpiDailyRawSheet);

    // Extract raw daily numbers for frontend date-filtered recalculation
    for (let i = 1; i < kpiDailyRawSheet.length; i++) {
      const row = kpiDailyRawSheet[i] || [];
      const nums = row
        .slice(1)
        .map((v) => (v === null || v === undefined ? NaN : parseFloat(String(v))));
      kpiDailyRaw.push(nums);
    }
    kpiDailyDates = (kpiDailyRawSheet[0] || [])
      .slice(1)
      .map((v) => excelSerialToISO(v));
  }

  // 3. Fetch all sub-account KPI sheets in parallel, then merge
  const subKpiRawResults = await Promise.all(
    config.kpiSubSheets.map((src) =>
      getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.range)
    )
  );
  const subAccountKpi = subKpiRawResults.flatMap((raw) => parseSubAccountKpi(raw));

  // 4. Calculate summaries
  const totalGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
  const totalSales = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);
  const brandSummary = {
    gmv: formatNumber(totalGmv),
    salesCount: formatNumber(totalSales),
    rawGmv: totalGmv,
    rawSales: totalSales,
  };

  const accountSummaries = config.accounts.map((name) => {
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

  const summaryDuration = dailyData.reduce((s, d) => s + d.rawDuration, 0);
  const summaryGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
  const summarySalesAfter = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);

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
    kpiDailyDates,
    accounts: config.accounts,
    brandLabel: config.brandLabel,
    color: config.color,
    mainKpiLabel: config.mainKpiLabel,
    hasData: true,
  };
}

/* ========== API Route Handler ========== */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand') || 'vivo';

    if (brand === 'all') {
      const accessToken = await getTenantAccessToken();
      const brandKeys = ['vivo', 'iqoo', 'iot'];
      const results: Record<string, Awaited<ReturnType<typeof fetchBrandData>>> = {};

      // Fetch all brands sequentially to avoid rate limits
      for (const bk of brandKeys) {
        try {
          results[bk] = await fetchBrandData(accessToken, bk);
        } catch {
          results[bk] = emptyBrandData(bk) || results[bk];
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'all',
        data: results,
      });
    }

    // Single brand
    const config = BRAND_SHEET_MAP[brand];
    if (!config) {
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
