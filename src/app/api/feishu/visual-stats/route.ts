import { NextRequest, NextResponse } from 'next/server';

/* ========== Feishu Config ========== */
const VISUAL_SPREADSHEET_TOKEN = 'EvixwxYM8i2cvpkZmSTcqOMYnph';
const VISUAL_SHEET_ID = 'ede956';

/* ========== VisualItem Type ========== */
export interface VisualItem {
  brand: string;
  creator: string;
  category: string;       // 日播 | 发布会 | 主题
  name: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  exposureRatePeople: number | null;
  exposureRateCount: number | null;
  avgStayDuration: string;
  avgFollowRate: string;
  designInspiration: string;
  designPlan: string;
  evaluation: string;
}

/* ========== Feishu API Helpers ========== */
async function getTenantAccessToken(): Promise<string> {
  const appId = process.env.FEISHU_APP_ID || 'cli_aad6eadc8d381cde';
  const appSecret = process.env.FEISHU_APP_SECRET || 'ejUxI30c9sYDW1NWha0lqeABBMPYFZca';

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

/* ========== Parse Helpers ========== */
function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (Array.isArray(val)) return val.map((v) => String(v || '')).join(',');
  if (typeof val === 'object') return JSON.stringify(val);
  return '';
}

function parseNumber(val: string): number | null {
  if (!val || val.trim() === '') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

function parseRow(row: string[]): VisualItem {
  const s = (idx: number) => safeString(row[idx]);
  return {
    brand: s(0),
    creator: s(1),
    category: s(2),
    name: s(3),
    imageUrl: s(4),
    startDate: s(5),
    endDate: s(6),
    exposureRatePeople: parseNumber(s(7)),
    exposureRateCount: parseNumber(s(8)),
    avgStayDuration: s(9),
    avgFollowRate: s(10),
    designInspiration: s(11),
    designPlan: s(12),
    evaluation: s(13),
  };
}

/* ========== API Route ========== */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brandFilter = searchParams.get('brand');
    const categoryFilter = searchParams.get('category');

    const accessToken = await getTenantAccessToken();
    const rawValues = await getSheetValues(
      accessToken,
      VISUAL_SPREADSHEET_TOKEN,
      VISUAL_SHEET_ID,
      'A1:N200'
    );

    // Skip header row (index 0), parse data rows
    const items: VisualItem[] = rawValues
      .slice(1)
      .filter((row) => row.some((cell) => {
        const s = safeString(cell);
        return s.trim() !== '';
      }))
      .map(parseRow);

    // Apply filters
    let filtered = items;

    if (brandFilter && brandFilter !== 'top') {
      filtered = filtered.filter((item) =>
        item.brand.toLowerCase() === brandFilter.toLowerCase()
      );
    }

    if (categoryFilter) {
      const categories = categoryFilter.split(',').map((c) => c.trim());
      if (categories.length > 0 && categories[0] !== '') {
        filtered = filtered.filter((item) =>
          categories.includes(item.category)
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: filtered,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
