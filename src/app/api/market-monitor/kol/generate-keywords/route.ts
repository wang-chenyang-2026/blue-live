import { NextRequest, NextResponse } from 'next/server';
import { kolGenerateKeywords } from '@/lib/kol-mcp';

/**
 * POST /api/market-monitor/kol/generate-keywords
 *
 * 请求体：
 * {
 *   brand, product, targetAudience, liveType, budget,
 *   priceRanges: { lower1, upper1, lower20, upper20, lower60, upper60 },
 *   influencerType?, platform?, content_direction?, background?
 * }
 *
 * 返回：
 * { success, data: { keyword_groups, metrics, user_metrics, contword, task_name, raw } }
 */

// 按达人类型的默认刊例价和粉丝范围
const INFLUENCER_DEFAULTS: Record<string, {
  fansLower: number; fansUpper: number;
  priceLower60: number; priceUpper60: number;
}> = {
  '头部': { fansLower: 1000000, fansUpper: 10000000, priceLower60: 100000, priceUpper60: 500000 },
  '中腰部': { fansLower: 100000, fansUpper: 1000000, priceLower60: 10000, priceUpper60: 100000 },
  '尾部': { fansLower: 10000, fansUpper: 100000, priceLower60: 1000, priceUpper60: 10000 },
  '素人': { fansLower: 1000, fansUpper: 10000, priceLower60: 0, priceUpper60: 1000 },
};

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
      content_direction = '',
      background = '',
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
      content_direction?: string;
      background?: string;
    };

    if (!product?.trim()) {
      return NextResponse.json(
        { success: false, error: '产品名称必填' },
        { status: 400 },
      );
    }

    // 获取达人类型默认值（默认中腰部）
    const defaults = INFLUENCER_DEFAULTS[influencerType] || INFLUENCER_DEFAULTS['中腰部'];

    // 刊例价：前端传了就用前端的，否则用达人类型默认值
    const lower1 = Number(priceRanges.lower1 ?? 1000);
    const upper1 = Number(priceRanges.upper1 ?? 50000);
    const lower20 = Number(priceRanges.lower20 ?? 2000);
    const upper20 = Number(priceRanges.upper20 ?? 80000);
    const lower60 = Number(priceRanges.lower60 ?? defaults.priceLower60);
    const upper60 = Number(priceRanges.upper60 ?? defaults.priceUpper60);

    // 粉丝范围默认值
    const kolFansRangeLower = defaults.fansLower;
    const kolFansRangeUpper = defaults.fansUpper;

    const compressedBriefParts = [
      brand && `品牌${brand}`,
      product && `产品${product}`,
      targetAudience && `目标人群${targetAudience}`,
      liveType && `直播类型${liveType}`,
      budget && `预算${budget}`,
      influencerType && `达人类型${influencerType}`,
      content_direction && `内容方向${content_direction}`,
      background && `项目背景${background}`,
      `平台${platform}`,
    ].filter(Boolean);
    const compressedBrief = compressedBriefParts.join('，');

    const entityReport: Record<string, unknown> = {
      product,
      platform,
      brand: brand || undefined,
      influencer_type: influencerType || undefined,
      content_direction: content_direction || undefined,
      background: background || undefined,
      metrics: {
        kolFansRangeLower,
        kolFansRangeUpper,
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
      content_direction && `内容方向：${content_direction}`,
      background && `项目背景：${background}`,
    ]
      .filter(Boolean)
      .join('\n');

    // full_context 不能为空字符串，兜底用 compressedBrief
    const finalFullContext = fullContext || compressedBrief.slice(0, 500);

    const result = await kolGenerateKeywords({
      compressed_brief: compressedBrief.slice(0, 500),
      entity_report: entityReport,
      full_context: finalFullContext,
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
