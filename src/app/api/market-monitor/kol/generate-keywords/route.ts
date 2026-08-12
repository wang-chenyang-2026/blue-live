import { NextRequest, NextResponse } from 'next/server';
import { kolGenerateKeywords } from '@/lib/kol-mcp';

/**
 * POST /api/market-monitor/kol/generate-keywords
 *
 * 请求体：
 * {
 *   brand, product, targetAudience, liveType, budget,
 *   priceRanges: { lower1, upper1, lower20, upper20, lower60, upper60 },
 *   influencerType?, platform?
 * }
 *
 * 返回：
 * { success, data: { keyword_groups, metrics, user_metrics, contword, task_name, raw } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      brand = '',
      product = '',
      targetAudience = '',
      liveType = '',
      budget = '',
      platform = '抖音',
      influencerType = '',
      priceRanges = {},
    } = body as {
      brand?: string;
      product?: string;
      targetAudience?: string;
      liveType?: string;
      budget?: string;
      platform?: string;
      influencerType?: string;
      priceRanges?: {
        lower1?: number;
        upper1?: number;
        lower20?: number;
        upper20?: number;
        lower60?: number;
        upper60?: number;
      };
    };

    if (!product?.trim()) {
      return NextResponse.json(
        { success: false, error: '产品名称必填' },
        { status: 400 },
      );
    }

    // 兜底默认刊例价（若前端没传）
    const lower1 = Number(priceRanges.lower1 ?? 1000);
    const upper1 = Number(priceRanges.upper1 ?? 50000);
    const lower20 = Number(priceRanges.lower20 ?? 2000);
    const upper20 = Number(priceRanges.upper20 ?? 80000);
    const lower60 = Number(priceRanges.lower60 ?? 5000);
    const upper60 = Number(priceRanges.upper60 ?? 150000);

    const compressedBriefParts = [
      brand && `品牌${brand}`,
      product && `产品${product}`,
      targetAudience && `目标人群${targetAudience}`,
      liveType && `直播类型${liveType}`,
      budget && `预算${budget}`,
      influencerType && `达人类型${influencerType}`,
      `平台${platform}`,
    ].filter(Boolean);
    const compressedBrief = compressedBriefParts.join('，');

    const entityReport: Record<string, unknown> = {
      product,
      platform,
      brand: brand || undefined,
      influencer_type: influencerType || undefined,
      metrics: {
        priceLower1: lower1,
        priceUpper1: upper1,
        priceLower20: lower20,
        priceUpper20: upper20,
        priceLower60: lower60,
        priceUpper60: upper60,
      },
    };

    const fullContext = [
      brand && `品牌：${brand}`,
      product && `产品：${product}`,
      targetAudience && `目标人群：${targetAudience}`,
      liveType && `直播类型：${liveType}`,
      budget && `预算：${budget}`,
      `平台：${platform}`,
      influencerType && `达人类型：${influencerType}`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await kolGenerateKeywords({
      compressed_brief: compressedBrief.slice(0, 500),
      entity_report: entityReport,
      full_context: fullContext,
    });

    return NextResponse.json({
      success: true,
      data: {
        keyword_groups: result.keyword_groups || [],
        metrics: result.metrics || {},
        user_metrics: result.user_metrics || {},
        contword: result.contword || [],
        task_name: result.task_name || '',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-keywords] failed:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
