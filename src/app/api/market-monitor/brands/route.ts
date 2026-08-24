import { NextResponse } from 'next/server';
import { callTool, initializeServer } from '@/lib/mcp-client';

/**
 * Calculate start_date and end_date from timeRange string
 */
function calcDateRange(timeRange: string): { startMonth: string; endMonth: string } {
  const now = new Date();
  const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = new Date(now);

  const monthMap: Record<string, number> = {
    '近30天': 1,
    '近90天': 3,
    '近半年': 6,
    '近一年': 12,
    '本年度': 0,
  };

  if (timeRange === '本年度') {
    startDate.setMonth(0);
  } else {
    const months = monthMap[timeRange] ?? 3;
    startDate.setMonth(startDate.getMonth() - months);
  }

  const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  return { startMonth, endMonth };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const categoryStr = searchParams.get('category');
  const timeRange = searchParams.get('timeRange') || '近90天';

  if (!categoryStr) {
    return NextResponse.json({ success: false, error: '缺少category参数' }, { status: 400 });
  }

  let category: string[];
  try {
    category = JSON.parse(categoryStr);
  } catch {
    return NextResponse.json({ success: false, error: 'category格式错误' }, { status: 400 });
  }

  if (!Array.isArray(category) || category.length === 0) {
    return NextResponse.json({ success: false, error: 'category必须是数组' }, { status: 400 });
  }

  const { startMonth, endMonth } = calcDateRange(timeRange);

  try {
    const { sessionId } = await initializeServer('crawler-server');
    const result = await callTool(
      'crawler-server',
      'download_data',
      {
        category_list: category,
        category_view: '品类视角-品牌列表',
        start_date: startMonth,
        end_date: endMonth,
        brand: '',
      },
      sessionId,
    );

    const textContent = result.content?.[0]?.text || '';
    let parsed: { code?: number; data?: Array<Record<string, unknown>> } = {};
    try {
      parsed = JSON.parse(textContent);
    } catch {
      return NextResponse.json({ success: false, error: 'MCP返回数据解析失败' }, { status: 500 });
    }

    if (parsed.code !== 200 || !Array.isArray(parsed.data)) {
      return NextResponse.json({
        success: false,
        error: '接口返回异常',
      }, { status: 500 });
    }

    // Extract unique brands and sort by sales amount descending
    const brandMap = new Map<string, number>();
    for (const row of parsed.data) {
      const brandName = String(row['品牌'] || '').trim();
      const sales = Number(row['销售额(元)'] || 0);
      if (brandName) {
        brandMap.set(brandName, (brandMap.get(brandName) || 0) + sales);
      }
    }

    const brands = Array.from(brandMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, totalSales]) => ({ name, totalSales }));

    return NextResponse.json({
      success: true,
      brands,
      total: brands.length,
      dateRange: { start: startMonth, end: endMonth },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '获取品牌列表失败' },
      { status: 500 },
    );
  }
}
