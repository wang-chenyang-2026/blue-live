import { NextRequest, NextResponse } from 'next/server';
import {
  crawlerDownloadData,
  normalizeDownloadResult,
  type CategoryView,
  type CrawlerDownloadResult,
} from '@/lib/crawler-mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // crawler 拉取 Excel 解析较慢

/**
 * 内存缓存：同一 category_list + category_view 在 TTL 内直接复用。
 * 避免反复下载 Excel。单进程内有效，足够支撑页面刷新 / 切换。
 */
interface CacheEntry {
  ts: number;
  promise: Promise<CrawlerDownloadResult>;
}
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(parts: [string, string, string], view: string): string {
  return `${parts[0]}|${parts[1]}|${parts[2] || '__ALL__'}|${view}`;
}

function isValidView(v: string | null): v is CategoryView {
  return (
    v === '品类视角-大盘趋势' ||
    v === '品类视角-销售价量' ||
    v === '品牌列表' ||
    v === '店铺列表' ||
    v === '商品列表' ||
    v === '价格区间' ||
    v === '价格交叉' ||
    v === '热词频次'
  );
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const l1 = sp.get('l1') || '';
  const l2 = sp.get('l2') || '';
  const l3 = sp.get('l3') || '';
  const view = sp.get('view');
  const force = sp.get('force') === '1';

  if (!l1 || !l2) {
    return NextResponse.json(
      { success: false, error: '缺少必填参数 l1（一级品类）或 l2（二级品类）' },
      { status: 400 },
    );
  }
  if (!isValidView(view)) {
    return NextResponse.json(
      { success: false, error: `view 非法：${view ?? ''}` },
      { status: 400 },
    );
  }

  const categoryList: [string, string, string] = [l1, l2, l3 || ''];
  const key = cacheKey(categoryList, view);

  try {
    let entry = cache.get(key);
    const now = Date.now();
    if (!force && entry && now - entry.ts < CACHE_TTL_MS) {
      const data = await entry.promise;
      return NextResponse.json({ success: true, data, cached: true });
    }

    const promise = crawlerDownloadData({
      categoryList,
      categoryView: view,
    }).then((res) => {
      // 防御：确保即便底层返回未规范化结构，也再走一次规范化
      return normalizeDownloadResult(res as unknown);
    });

    cache.set(key, { ts: now, promise });

    const data = await promise;
    return NextResponse.json({ success: true, data, cached: false });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[brand/crawler]', msg);
    // 失败时清除缓存，避免坏 Promise 被持续复用
    cache.delete(key);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
