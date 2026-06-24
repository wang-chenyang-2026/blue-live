import { NextRequest, NextResponse } from 'next/server';

const SPREADSHEET_TOKEN = 'LdEIsmpHUhzGrXttf6gcYjWBnEN';

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
  const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${SPREADSHEET_TOKEN}/values/${range}?sheetId=${sheetId}`;
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
  // Excel serial number to JS Date
  const date = new Date((num - 25569) * 86400 * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}月${day}日`;
}

function formatNumber(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(n)) return String(num);
  return n.toLocaleString('zh-CN');
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = await getTenantAccessToken();

    // Read all three sheets in parallel
    const [sheet1Raw, sheet2Raw, sheet3Raw] = await Promise.all([
      getSheetValues(accessToken, '0a2100', 'A1:G39'),
      getSheetValues(accessToken, '204xjT', 'A1:G6'),
      getSheetValues(accessToken, 'vcgTtP', 'A1:F3'),
    ]);

    // Process Sheet1 - daily data
    const dailyData: Array<{
      date: string;
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

    // Calculate brand summary & account summaries
    const totalGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
    const totalSales = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);
    const brandSummary = {
      gmv: formatNumber(totalGmv),
      salesCount: formatNumber(totalSales),
      rawGmv: totalGmv,
      rawSales: totalSales,
    };

    const accountNames = ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'];
    const accountSummaries = accountNames.map((name) => {
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

    // Process Sheet2 - vivo（大号）KPI
    const kpiData: Array<{
      dimension: string;
      target: string;
      achieved: string;
      rate: string;
      isLow: boolean;
    }> = [];

    for (let i = 1; i < sheet2Raw.length; i++) {
      const row = sheet2Raw[i];
      if (!row || row.length < 6) continue;

      const dimension = row[2] || '';
      const targetVal = parseFloat(row[4]) || 0;
      const achievedVal = parseFloat(row[5]) || 0;

      let rate = 0;
      if (targetVal > 0) {
        rate = achievedVal / targetVal;
      }

      // Format target and achieved based on dimension
      let targetDisplay: string;
      let achievedDisplay: string;

      if (
        dimension.includes('率') ||
        dimension.includes('转粉') ||
        dimension.includes('观看')
      ) {
        // Percentage values
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
        isLow: rate < 1,
      });
    }

    // Process Sheet3 - sub-account KPI
    const subAccountKpi: Array<{
      account: string;
      dimension: string;
      target: string;
      achieved: string;
      rate: string;
      isLow: boolean;
    }> = [];

    for (let i = 1; i < sheet3Raw.length; i++) {
      const row = sheet3Raw[i];
      if (!row || row.length < 3) continue;

      const account = row[0] || '';
      const dimension = row[2] || '违规次数';
      const targetVal = parseFloat(row[4]) || 0;
      const achievedVal = parseFloat(row[5]) || 0;

      // For violation counts: 0 violations = 100%, otherwise 0%
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
        isLow: rate < 1,
      });
    }

    // Calculate summary row for daily data
    const summaryDuration = dailyData.reduce((s, d) => s + d.rawDuration, 0);
    const summaryGmv = dailyData.reduce((s, d) => s + d.rawGmv, 0);
    const summarySalesBefore = dailyData.reduce(
      (s, d) => s + (parseFloat(String(d.salesBeforeReturn).replace(/,/g, '')) || d.rawGmv),
      0
    );
    const summarySalesAfter = dailyData.reduce((s, d) => s + d.rawSalesAfter, 0);

    return NextResponse.json({
      success: true,
      data: {
        brandSummary,
        accountSummaries,
        dailyData,
        dailySummary: {
          duration: `${summaryDuration}小时`,
          gmv: formatNumber(summaryGmv),
          salesBeforeReturn: formatNumber(summarySalesBefore),
          salesAfterReturn: formatNumber(summarySalesAfter),
        },
        kpiData,
        subAccountKpi,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
