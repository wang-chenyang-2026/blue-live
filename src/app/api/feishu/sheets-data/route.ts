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
  range: string;         // Main data range (A:H)
  dailyRange: string;    // Daily data range for calculating achieved values
  accountName?: string;  // Override account name (for merged cells)
  label?: string;        // Tab label for frontend display
  hasOverallRate?: boolean; // Whether column D is "整体完成率" (shifts target/achieved/rate columns by 1)
}

interface BrandSheetConfig {
  dailySheets: DailySheetSource[];
  kpiSheets: KpiSheetSource[];
  accounts: string[];
  brandLabel: string;
  color: string;
}

const BRAND_SHEET_MAP: Record<string, BrandSheetConfig> = {
  vivo: {
    dailySheets: [
      { spreadsheetToken: VIVO_TOKEN, sheetId: '0a2100', range: 'A1:J200' },
    ],
    kpiSheets: [
      { spreadsheetToken: VIVO_TOKEN, sheetId: '204xjT', range: 'A1:H6', dailyRange: 'H1:AL6', label: 'vivo（大号）KPI' },
      { spreadsheetToken: VIVO_TOKEN, sheetId: 'vcgTtP', range: 'A1:H10', dailyRange: 'G1:AK10', label: '子账号KPI', hasOverallRate: false },
    ],
    accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'],
    brandLabel: 'vivo',
    color: '#415FFF',
  },
  iQOO: {
    dailySheets: [
      { spreadsheetToken: IQOO_TOKEN, sheetId: '0a2100', range: 'A1:J200' },
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'RYPvqw', range: 'A1:J200' },
    ],
    kpiSheets: [
      { spreadsheetToken: IQOO_TOKEN, sheetId: '204xjT', range: 'A1:H6', dailyRange: 'H1:AL6', label: 'iQOO手机（抖音）KPI' },
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'vcgTtP', range: 'A1:H10', dailyRange: 'G1:AK10', label: 'iQOO官方旗舰店（抖音）KPI', accountName: 'iQOO官方旗舰店（抖音）', hasOverallRate: false },
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'XXnMYT', range: 'A1:H10', dailyRange: 'H1:AL10', label: 'iQOO官方旗舰店（快手）KPI', accountName: 'iQOO官方旗舰店（快手）' },
    ],
    accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'],
    brandLabel: 'iQOO',
    color: '#FF6B35',
  },
  IOT: {
    dailySheets: [
      { spreadsheetToken: IOT_TOKEN, sheetId: '0a2100', range: 'A1:J200' },
      { spreadsheetToken: IOT_TOKEN, sheetId: 'RYPvqw', range: 'A1:J200' },
    ],
    kpiSheets: [
      { spreadsheetToken: IOT_TOKEN, sheetId: '204xjT', range: 'A1:H10', dailyRange: 'H1:AL10', label: 'IOT平板KPI' },
      { spreadsheetToken: IOT_TOKEN, sheetId: 'XXnMYT', range: 'A1:H10', dailyRange: 'H1:AL10', label: 'IOT手表KPI', accountName: 'IOT手表' },
    ],
    accounts: ['IOT平板', 'IOT手表'],
    brandLabel: 'IOT',
    color: '#00C9A7',
  },
};

// Brand metadata fallback
const BRAND_META: Record<string, { accounts: string[]; brandLabel: string; color: string }> = {
  vivo: { accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'], brandLabel: 'vivo', color: '#415FFF' },
  iQOO: { accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'], brandLabel: 'iQOO', color: '#FF6B35' },
  IOT: { accounts: ['IOT平板', 'IOT手表'], brandLabel: 'IOT', color: '#00C9A7' },
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

/* ========== Parse Daily Data from Raw Sheet ========== */
function parseDailyData(raw: string[][], columnOffset: number = 0): Array<{
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

  const minRowLength = 7 + columnOffset; // 7 for old structure, 10 for IOT new structure

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.length < minRowLength) continue;

    const dateSerial = row[1];
    const accountName = row[2] || '';
    const duration = parseFloat(row[3]) || 0;
    const gmv = parseFloat(row[4 + columnOffset]) || 0;
    const salesBefore = parseFloat(row[5 + columnOffset]) || 0;
    const salesAfter = parseFloat(row[6 + columnOffset]) || 0;

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

/**
 * Calculate average from daily data row (H:AL columns).
 * Row 0 is header (dates). Row index i corresponds to data row i.
 * The dailyRaw rows are aligned with the main KPI rows (same row index).
 */
function calcAverageFromDaily(dailyRow: string[]): number {
  // dailyRow contains actual daily data values from H:AL columns.
  // All cells are numeric values (or empty/None for future dates).
  // Do NOT skip any cells — every numeric value is a valid daily data point.
  const nums = dailyRow
    .map((v) => parseFloat(String(v)))
    .filter((v) => !isNaN(v));
  return nums.length === 0 ? 0 : nums.reduce((s, v) => s + v, 0) / nums.length;
}

/**
 * Parse KPI Sheet using both main data and daily data.
 * 
 * Two possible sheet structures:
 * 
 * Structure A (hasOverallRate = true, default):
 *   A (0): 账号, B (1): 月份, C (2): 维度, D (3): 整体完成率,
 *   E (4): 6月目标, F (5): 6月达成, G (6): 达成率, H (7+): 每日数据
 * 
 * Structure B (hasOverallRate = false):
 *   A (0): 账号, B (1): 月份, C (2): 维度,
 *   D (3): 6月目标, E (4): 6月达成, F (5): 达成率, G (6+): 每日数据
 * 
 * Since Feishu API returns formula strings (e.g. "AVERAGE(H2:AL2)") instead of
 * computed values, we must:
 * 1. Read target from the target column (E for A, D for B — actual number)
 * 2. Calculate achieved from daily columns (AVERAGE)
 * 3. Calculate rate = achieved / target
 * 4. Calculate overallRate = count(rate >= 100%) / total items
 */
function parseKpiSheet(
  mainRaw: string[][],
  dailyRaw: string[][],
  _accountOverride?: string,
  hasOverallRate: boolean = true
): {
  items: Array<{
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }>;
  overallRate: number | null;
} {
  // Column offsets based on sheet structure
  // Structure A: target=E(4), Structure B: target=D(3)
  const targetIdx = hasOverallRate ? 4 : 3;

  const items: Array<{
    dimension: string;
    target: string;
    achieved: string;
    rate: string;
    rawRate: number;
    isLow: boolean;
  }> = [];

  // Skip header row (index 0), process data rows starting from index 1
  for (let i = 1; i < mainRaw.length; i++) {
    const row = mainRaw[i];
    if (!row || row.length < targetIdx + 1) continue;

    const dimension = (row[2] || '').trim();
    if (!dimension) continue;

    // Read target from the correct column based on structure
    const targetVal = parseFloat(row[targetIdx]);
    if (isNaN(targetVal) && targetVal !== 0) continue;

    // Calculate achieved from daily data (H:AL columns)
    const dailyRow = dailyRaw[i] || [];
    const achievedVal = calcAverageFromDaily(dailyRow);

    // Calculate rate
    let rateVal: number;
    if (dimension.includes('违规') || dimension.includes('失误')) {
      // Violation/mistake KPI: 0 = 100%, any non-zero = 0%
      rateVal = achievedVal === 0 ? 1 : 0;
    } else if (targetVal === 0) {
      rateVal = achievedVal === 0 ? 1 : 0;
    } else {
      rateVal = achievedVal / targetVal;
    }

    // Format display values
    let targetDisplay: string;
    let achievedDisplay: string;

    if (dimension.includes('率') || dimension.includes('转粉') || dimension.includes('观看')) {
      // Percentage-type dimensions (e.g. 曝光-观看率, 直播转粉率)
      targetDisplay = `${(targetVal * 100).toFixed(0)}%`;
      achievedDisplay = `${(achievedVal * 100).toFixed(2)}%`;
    } else if (dimension.includes('GPM')) {
      // Currency-like dimension
      targetDisplay = formatNumber(targetVal);
      achievedDisplay = formatNumber(Math.round(achievedVal));
    } else if (dimension.includes('停留')) {
      // Duration in seconds
      targetDisplay = `${targetVal}秒`;
      achievedDisplay = `${achievedVal.toFixed(1)}秒`;
    } else {
      // Violation/mistake counts
      targetDisplay = `${targetVal}次`;
      achievedDisplay = `${achievedVal}次`;
    }

    items.push({
      dimension,
      target: targetDisplay,
      achieved: achievedDisplay,
      rate: `${(rateVal * 100).toFixed(2)}%`,
      rawRate: rateVal,
      isLow: rateVal < 1,
    });
  }

  // Calculate overall completion rate: count items where rate >= 100% / total items
  let overallRate: number | null = null;
  if (items.length > 0) {
    const passedCount = items.filter((k) => k.rawRate >= 1).length;
    overallRate = passedCount / items.length;
  }

  return { items, overallRate };
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
    kpiTabs: [],
    accounts: meta.accounts,
    brandLabel: meta.brandLabel,
    color: meta.color,
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
  const dailyData = dailyRawResults.flatMap((raw) => parseDailyData(raw, 3));

  // 2. Fetch all KPI sheets in parallel, each becomes a Tab
  // Each sheet needs both main data (A:H) and daily data (H:AL)
  const kpiTabResults = await Promise.all(
    config.kpiSheets.map(async (src) => {
      const [mainRaw, dailyRaw] = await Promise.all([
        getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.range),
        getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.dailyRange),
      ]);
      const parsed = parseKpiSheet(mainRaw, dailyRaw, src.accountName, src.hasOverallRate !== false);
      return {
        label: src.label || 'KPI',
        items: parsed.items,
        overallRate: parsed.overallRate,
      };
    })
  );

  // 3. Calculate summaries
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
    kpiTabs: kpiTabResults,
    accounts: config.accounts,
    brandLabel: config.brandLabel,
    color: config.color,
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
      const brandKeys = ['vivo', 'iQOO', 'IOT'];
      const results: Record<string, Awaited<ReturnType<typeof fetchBrandData>>> = {};

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
      return NextResponse.json({ success: true, mode: 'single', brand, data: emptyData });
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
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

