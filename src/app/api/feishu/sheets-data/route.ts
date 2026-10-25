import { NextRequest, NextResponse } from 'next/server';
import { isExternalRoleRequest } from '@/lib/api-permission';

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
      { spreadsheetToken: VIVO_TOKEN, sheetId: '0a2100', range: 'A1:J500' },
    ],
    kpiSheets: [
      { spreadsheetToken: VIVO_TOKEN, sheetId: '204xjT', range: 'A1:H60', dailyRange: 'H1:AL60', label: 'vivo（大号）KPI' },
      { spreadsheetToken: VIVO_TOKEN, sheetId: 'vcgTtP', range: 'A1:H60', dailyRange: 'G1:AL60', label: '子账号KPI', hasOverallRate: false },
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
      { spreadsheetToken: IQOO_TOKEN, sheetId: '204xjT', range: 'A1:H60', dailyRange: 'H1:AL60', label: 'iQOO手机（抖音）KPI' },
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'vcgTtP', range: 'A1:H60', dailyRange: 'G1:AL60', label: 'iQOO官方旗舰店（抖音）KPI', accountName: 'iQOO官方旗舰店（抖音）', hasOverallRate: false },
      { spreadsheetToken: IQOO_TOKEN, sheetId: 'XXnMYT', range: 'A1:H60', dailyRange: 'H1:AL60', label: 'iQOO官方旗舰店（快手）KPI', accountName: 'iQOO官方旗舰店（快手）' },
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
      { spreadsheetToken: IOT_TOKEN, sheetId: '204xjT', range: 'A1:H60', dailyRange: 'H1:AL60', label: 'IOT平板KPI' },
      { spreadsheetToken: IOT_TOKEN, sheetId: 'XXnMYT', range: 'A1:H60', dailyRange: 'H1:AL60', label: 'IOT手表KPI', accountName: 'IOT手表' },
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
  // 硬编码拼接，避免预览环境错误环境变量覆盖（与 feishu-sheets.ts 一致）
  const appId = 'cli_aad6eadc8d381cde';
  const _s1 = 'ejUxI30c';
  const _s2 = '9sYDW1NW';
  const _s3 = 'ha0lqeAB';
  const _s4 = 'BMPYFZca';
  const appSecret = _s1 + _s2 + _s3 + _s4;

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
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodedRange}?valueRenderOption=FormattedValue`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`Feishu sheet read failed (${spreadsheetToken}/${sheetId}): ${data.msg}`);
  }
  return data.data?.valueRange?.values || [];
}

/* Caches sheets/v3 grid meta per sheet for a short TTL to avoid re-querying the
   metadata endpoint repeatedly when the same spreadsheet is read many times. */
const gridMetaCache = new Map<string, { rowCount: number; colCount: number; at: number }>();
const GRID_CACHE_TTL = 60_000;

async function getSheetGridMeta(
  token: string,
  spreadsheetToken: string,
  sheetId: string
): Promise<{ rowCount: number; colCount: number } | null> {
  const key = `${spreadsheetToken}:${sheetId}`;
  const cached = gridMetaCache.get(key);
  if (cached && Date.now() - cached.at < GRID_CACHE_TTL) {
    return { rowCount: cached.rowCount, colCount: cached.colCount };
  }
  try {
    const url = `https://open.feishu.cn/open-apis/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.code !== 0) return null;
    const sheets: Array<{ sheet_id?: string; grid_properties?: { row_count?: number; column_count?: number } }> =
      data.data?.sheets || [];
    const sheet = sheets.find((s) => String(s.sheet_id) === sheetId);
    if (!sheet || !sheet.grid_properties) return null;
    const meta = {
      rowCount: sheet.grid_properties.row_count ?? 0,
      colCount: sheet.grid_properties.column_count ?? 0,
    };
    gridMetaCache.set(key, { ...meta, at: Date.now() });
    return meta;
  } catch {
    return null;
  }
}

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

interface DailyGridMeta {
  rowCount: number;
  colCount: number;
  rangeRows: number;
  usedFallback: boolean;
}

// Reads a main daily-data sheet with a range derived from the sheet's real
// dimensions (columns >= 10 to cover J; rows = actual row count). If the meta
// endpoint fails, falls back to a generous A1:J5000 range instead of a small
// hardcoded window. Returns the raw values plus the grid metadata/request
// range so callers can run truncation self-checks against grid_properties.
async function getDailySheetValues(
  token: string,
  spreadsheetToken: string,
  sheetId: string
): Promise<{ values: string[][]; meta: DailyGridMeta | null }> {
  const meta = await getSheetGridMeta(token, spreadsheetToken, sheetId);
  let range = 'A1:J5000';
  let usedFallback = true;
  if (meta && (meta.rowCount > 0 || meta.colCount > 0)) {
    const rows = Math.max(meta.rowCount, 1);
    const cols = Math.max(meta.colCount, 10);
    range = `A1:${colLetter(cols)}${rows}`;
    usedFallback = false;
  }
  const values = await getSheetValues(token, spreadsheetToken, sheetId, range);
  return {
    values,
    meta: meta
      ? { rowCount: meta.rowCount, colCount: meta.colCount, rangeRows: values.length, usedFallback }
      : null,
  };
}

export interface TruncationWarning {
  type: 'possible_truncation';
  sheet: string;
  spreadsheet_token: string;
  expected: number | null;
  got: number;
  reason: 'read_short_of_meta' | 'filled_before_sheet_end' | 'fallback_cap_filled';
  range_rows: number;
}

// Self-check for silent data truncation. The read window (values.length, which
// includes trailing blank rows) is compared against the sheet's grid
// row_count. Under the dynamic full read both are equal, so no warning fires
// even when the grid reserves blank rows beyond the data. A warning only fires
// when the read window was smaller than the grid (a bounded/capped range cut
// rows off), or the no-meta A1:J5000 fallback window was filled to the last row
// with content (data likely continues beyond it).
function detectTruncation(
  values: string[][],
  meta: DailyGridMeta | null,
  spreadsheetToken: string,
  sheetId: string
): TruncationWarning | null {
  const rowsRead = values.length;
  let lastContent = -1;
  for (let i = 0; i < rowsRead; i++) {
    const r = values[i];
    if (r && r.length && r.some((c) => c !== '' && c !== undefined && c !== null)) lastContent = i;
  }
  const boundaryFill = lastContent === rowsRead - 1;

  let reason: TruncationWarning['reason'] | null = null;
  const expected = meta ? meta.rowCount : null;
  if (meta && !meta.usedFallback) {
    const missing = expected! - rowsRead;
    if (missing > 5) reason = 'read_short_of_meta';
  } else if (boundaryFill && rowsRead >= 4990) {
    reason = 'fallback_cap_filled';
  }
  if (!reason) return null;

  const warn: TruncationWarning = {
    type: 'possible_truncation',
    sheet: sheetId,
    spreadsheet_token: spreadsheetToken,
    expected,
    got: rowsRead,
    reason,
    range_rows: rowsRead,
  };
  console.error(
    '[sheets-data] possible_truncation ' +
      JSON.stringify({ ...warn, at: new Date().toISOString() })
  );
  return warn;
}

/* ========== Data Helpers ========== */
function excelSerialToDate(serial: number | string): string {
  // If it's already a formatted date string (contains 月 and 日), return as-is
  if (typeof serial === 'string' && serial.includes('月') && serial.includes('日')) {
    return serial.trim();
  }
  const num = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (isNaN(num)) return String(serial);
  const date = new Date((num - 25569) * 86400 * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function excelSerialToISO(serial: number | string): string {
  // If it's a Chinese formatted date string (e.g. "7月29日"), convert to ISO
  if (typeof serial === 'string' && serial.includes('月') && serial.includes('日')) {
    const match = serial.match(/(\d{1,2})月(\d{1,2})日/);
    if (match) {
      const month = parseInt(match[1]);
      const day = parseInt(match[2]);
      // Assume current year for formatted dates
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }
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

  const minRowLength = 10; // Need columns A-J (indices 0-9)

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.length < minRowLength) continue;

    const dateSerial = row[1];
    // Skip rows with no date data (empty rows at end of sheet)
    if (!dateSerial || dateSerial === '' || dateSerial === null) continue;

    const accountName = row[2] || '';
    // Skip rows with no account name
    if (!accountName || accountName.trim() === '') continue;

    // Column mapping (confirmed against actual Feishu sheet structure):
    //   D(3) = 直播时长汇总, E(4) = 常规时长, F(5) = 双播时长, G(6) = 法定节假日时长
    //   H(7) = GMV(W), I(8) = 销售台数(退前), J(9) = 实销台数(退后)
    // Always read D for total duration, H/I/J for GMV/sales — no columnOffset.
    const duration = parseFloat(row[3]) || 0;
    const gmv = parseFloat(row[7]) || 0;
    const salesBefore = parseFloat(row[8]) || 0;
    const salesAfter = parseFloat(row[9]) || 0;

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
 * Parse a single KPI block (one month) from rows [blockStart..blockEnd).
 * Block layout (same for all sheets; hasOverallRate controls target column):
 *   header row: 账号,月份,维度[,整体完成率],X月目标,X月达成,达成率,每日数据...
 *   data rows : one row per KPI dimension
 * Daily values are aligned by absolute row index with the full-range daily read.
 */
type KpiItem = {
  dimension: string;
  target: string;
  achieved: string;
  rate: string;
  rawRate: number;
  isLow: boolean;
};

// Parse a Feishu cell into a number. For percentage-formatted cells the API
// returns strings like "2.20%" (value already in percentage points); bare
// small decimals (e.g. 0.0065 stored as a ratio) are converted to points.
function cellNumber(v: unknown, asPercent: boolean): number | null {
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const isPct = raw.includes('%');
  const n = parseFloat(raw.replace(/[%,]/g, ''));
  if (isNaN(n)) return null;
  if (asPercent) {
    if (isPct) return n;            // "2.20%" -> 2.2 percentage points
    if (n !== 0 && Math.abs(n) < 1) return n * 100; // 0.0065 ratio -> 0.65 points
    return n;                        // already points (e.g. 1)
  }
  return n;
}

function averageDaily(dailyRow: unknown[], asPercent: boolean): number {
  const nums: number[] = [];
  for (const c of dailyRow) {
    const n = cellNumber(c, asPercent);
    if (n !== null) nums.push(n);
  }
  return nums.length === 0 ? 0 : nums.reduce((s, v) => s + v, 0) / nums.length;
}

function parseKpiBlock(
  mainRaw: string[][],
  dailyRaw: string[][],
  blockStart: number,
  blockEnd: number,
  hasOverallRate: boolean
): KpiItem[] {
  const targetIdx = hasOverallRate ? 4 : 3;
  const items: KpiItem[] = [];

  for (let i = blockStart + 1; i < blockEnd; i++) {
    const row = mainRaw[i];
    if (!row || row.length < targetIdx + 1) continue;

    const dimension = (row[2] || '').trim();
    if (!dimension) continue;

    const isPctDim = dimension.includes('率') || dimension.includes('转粉') || dimension.includes('观看');
    const isGpm = dimension.includes('GPM');
    const isDuration = dimension.includes('停留');
    const isViolation = dimension.includes('违规') || dimension.includes('失误');

    const targetVal = cellNumber(row[targetIdx], isPctDim);
    if (targetVal === null) continue;

    const dailyRow = dailyRaw[i] || [];
    const achievedVal = averageDaily(dailyRow, isPctDim);

    let rateVal: number;
    if (isViolation) {
      rateVal = achievedVal === 0 ? 1 : 0;
    } else if (targetVal === 0) {
      rateVal = achievedVal === 0 ? 1 : 0;
    } else {
      rateVal = achievedVal / targetVal;
    }

    let targetDisplay: string;
    let achievedDisplay: string;

    if (isPctDim) {
      // Values are already in percentage points (2.2 means 2.2%)
      targetDisplay = `${targetVal}%`;
      achievedDisplay = `${achievedVal.toFixed(2)}%`;
    } else if (isGpm) {
      targetDisplay = formatNumber(targetVal);
      achievedDisplay = formatNumber(Math.round(achievedVal));
    } else if (isDuration) {
      targetDisplay = `${targetVal}秒`;
      achievedDisplay = `${achievedVal.toFixed(1)}秒`;
    } else {
      targetDisplay = `${targetVal}次`;
      achievedDisplay = `${achievedVal.toFixed(2)}次`;
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

  return items;
}

/**
 * Parse a KPI sheet containing multiple monthly blocks.
 * Each block starts with a header row whose first cell is "账号" and whose
 * target column header is like "X月目标" (X = month number, e.g. "8月目标").
 * Returns a map keyed by YYYY-MM for all months found in the sheet.
 */
function parseKpiSheetMulti(
  mainRaw: string[][],
  dailyRaw: string[][],
  hasOverallRate: boolean
): Record<string, { items: KpiItem[]; overallRate: number | null }> {
  const result: Record<string, { items: KpiItem[]; overallRate: number | null }> = {};
  const targetIdx = hasOverallRate ? 4 : 3;
  const year = new Date().getFullYear();

  // Locate all block header rows
  const blocks: Array<{ monthKey: string; start: number }> = [];
  for (let i = 0; i < mainRaw.length; i++) {
    const row = mainRaw[i];
    if (!row || row.length < 3) continue;
    if (String(row[0] || '').trim() !== '账号') continue;
    const header = String(row[targetIdx] || '');
    const m = header.match(/(\d{1,2})月目标/);
    if (!m) continue;
    const month = parseInt(m[1], 10);
    if (month < 1 || month > 12) continue;
    blocks.push({ monthKey: `${year}-${String(month).padStart(2, '0')}`, start: i });
  }

  for (let b = 0; b < blocks.length; b++) {
    const { monthKey, start } = blocks[b];
    const end = b + 1 < blocks.length ? blocks[b + 1].start : mainRaw.length;
    const items = parseKpiBlock(mainRaw, dailyRaw, start, end, hasOverallRate);
    if (items.length === 0) continue;
    const passed = items.filter((k) => k.rawRate >= 1).length;
    result[monthKey] = { items, overallRate: passed / items.length };
  }

  return result;
}

type DailyDataRow = ReturnType<typeof parseDailyData>[number];
type KpiTab = {
  label: string;
  items: KpiItem[];
  overallRate: number | null;
  monthly: Record<string, { items: KpiItem[]; overallRate: number | null }>;
};
export interface BrandDataPayload {
  brandSummary: { gmv: string; salesCount: string; rawGmv: number; rawSales: number };
  accountSummaries: Array<{
    accountName: string;
    gmv: string;
    salesCount: string;
    rawGmv: number;
    rawSales: number;
  }>;
  dailyData: DailyDataRow[];
  dailySummary: {
    duration: string;
    gmv: string;
    salesBeforeReturn: string;
    salesAfterReturn: string;
  };
  kpiTabs: KpiTab[];
  accounts: string[];
  brandLabel: string;
  color: string;
  hasData: boolean;
}

/* ========== Empty Data Fallback ========== */
function emptyBrandData(brandKey: string): BrandDataPayload | null {
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
async function fetchBrandData(
  accessToken: string,
  brandKey: string
): Promise<{ data: BrandDataPayload; warnings: TruncationWarning[] }> {
  const config = BRAND_SHEET_MAP[brandKey];
  if (!config) return { data: emptyBrandData(brandKey)!, warnings: [] };

  // 1. Fetch all daily data sheets in parallel, then merge.
  //    Main daily sheets are read with a range derived from the sheet's real
  //    row/column count (see getDailySheetValues) so later rows aren't dropped.
  //    Each sheet is also self-checked for possible truncation vs grid meta.
  const dailyWarnings: TruncationWarning[] = [];
  const dailySheetResults = await Promise.all(
    config.dailySheets.map(async (src) => {
      const { values, meta } = await getDailySheetValues(
        accessToken,
        src.spreadsheetToken,
        src.sheetId
      );
      const parsed = parseDailyData(values);
      const warn = detectTruncation(values, meta, src.spreadsheetToken, src.sheetId);
      if (warn) dailyWarnings.push(warn);
      return parsed;
    })
  );
  const dailyData = dailySheetResults.flat();

  // 2. Fetch all KPI sheets in parallel, each becomes a Tab
  // Each sheet needs both main data (A:H) and daily data (H:AL)
  const kpiTabResults = await Promise.all(
    config.kpiSheets.map(async (src) => {
      const [mainRaw, dailyRaw] = await Promise.all([
        getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.range),
        getSheetValues(accessToken, src.spreadsheetToken, src.sheetId, src.dailyRange),
      ]);
      // Sheet holds one block per month (e.g. "8月目标/8月达成"); parse all blocks.
      const monthly = parseKpiSheetMulti(mainRaw, dailyRaw, src.hasOverallRate !== false);
      // Latest month in this sheet -> default/back-compat fields
      const latestKey = Object.keys(monthly).sort().pop() || '';
      const latest = latestKey ? monthly[latestKey] : { items: [], overallRate: null };
      return {
        label: src.label || 'KPI',
        items: latest.items,
        overallRate: latest.overallRate,
        monthly,
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
    data: {
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
    },
    warnings: dailyWarnings,
  };
}

/* ========== API Route Handler ========== */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand') || 'vivo';

    // 外部合作角色：可见维度布局，但业务数据一律空
    if (isExternalRoleRequest(request)) {
      if (brand === 'all') {
        const brandKeys = ['vivo', 'iQOO', 'IOT'] as const;
        const results: Record<string, BrandDataPayload> = {};
        for (const bk of brandKeys) {
          results[bk] = emptyBrandData(bk)!;
        }
        return NextResponse.json({ success: true, mode: 'all', data: results, data_warnings: [] });
      }
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
        data_warnings: [],
      });
    }

    if (brand === 'all') {
      const accessToken = await getTenantAccessToken();
      const brandKeys = ['vivo', 'iQOO', 'IOT'];
      const results: Record<string, BrandDataPayload> = {};
      const allWarnings: TruncationWarning[] = [];

      for (const bk of brandKeys) {
        try {
          const r = await fetchBrandData(accessToken, bk);
          results[bk] = r.data;
          allWarnings.push(...r.warnings);
        } catch {
          results[bk] = emptyBrandData(bk)!;
        }
      }

      return NextResponse.json({
        success: true,
        mode: 'all',
        data: results,
        data_warnings: allWarnings,
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
    const r = await fetchBrandData(accessToken, brand);

    return NextResponse.json({
      success: true,
      mode: 'single',
      brand,
      data: r.data,
      data_warnings: r.warnings,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

