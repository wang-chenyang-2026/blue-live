import { NextResponse } from 'next/server';
import { callTool, initializeServer } from '@/lib/mcp-client';
import { buildCacheKey, getCached, setCached, TTL } from '@/lib/mcp-cache';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const categoryStr = searchParams.get('category');

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

  // Cache key: only category. No timeRange (MCP always returns 13 months, brand list is stable).
  const cacheKey = buildCacheKey(['brands', category]);
  const cached = getCached<{
    brands: { name: string; sales: number }[];
    total: number;
  }>(cacheKey);
  if (cached) {
    return NextResponse.json({ success: true, data: cached, cached: true });
  }

  // Don't make MCP call if client already disconnected
  if (req.signal.aborted) {
    return NextResponse.json({ success: false, error: '请求已取消' }, { status: 499 });
  }

  try {
    const { sessionId } = await initializeServer('crawler-server');

    if (req.signal.aborted) {
      return NextResponse.json({ success: false, error: '请求已取消' }, { status: 499 });
    }

    const result = await callTool(
      'crawler-server',
      'download_data',
      {
        category_list: category,
        category_view: '品类视角-品牌列表',
        // No start_date/end_date — MCP always returns months 2-14
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
      const sales = Number(row['销售额(元)']) || 0;
      if (brandName) {
        brandMap.set(brandName, (brandMap.get(brandName) || 0) + sales);
      }
    }

    const brands = Array.from(brandMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, sales]) => ({ name, sales }));

    const responseData = {
      brands,
      total: brands.length,
    };

    setCached(cacheKey, responseData, TTL.BRAND);

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '获取品牌列表失败' },
      { status: 500 },
    );
  }
}
