// 百应多维明细字段字典（81 字段，来源 buyin_fields.json）
// day/hour/anchor/product 为 1 表示该数据粒度支持该指标。
import raw from './buyin_fields.json';

export interface BuyinField {
  field: string;
  cn: string;
  cat: string;
  day: number;
  hour: number;
  anchor: number;
  product: number;
}

export type BuyinGranularity = 'day' | 'hour' | 'product' | 'anchor';

export const BUYIN_FIELDS: BuyinField[] = raw as BuyinField[];

// 粒度选项（顺序即展示顺序），label 展示名
export const BUYIN_GRANULARITIES: { key: BuyinGranularity; label: string; hint?: string }[] = [
  { key: 'day', label: '每日' },
  { key: 'hour', label: '分时' },
  { key: 'product', label: '商品' },
  { key: 'anchor', label: '主播', hint: '主播粒度按排班窗口汇总，手机订单无法拆分到主播。' },
];

// 大类顺序（按数据源出现顺序，天然 9 类）
export const BUYIN_CATS: string[] = (() => {
  const seen: string[] = [];
  for (const f of BUYIN_FIELDS) {
    if (!seen.includes(f.cat)) seen.push(f.cat);
  }
  return seen;
})();

// 某字段是否被所选粒度中的任一个支持
export function fieldSupported(f: BuyinField, granularities: BuyinGranularity[]): boolean {
  if (granularities.length === 0) return false;
  return granularities.some((g) => f[g] === 1);
}

// 过滤出当前所选粒度支持的字段（保持源顺序）
export function supportedFields(granularities: BuyinGranularity[]): BuyinField[] {
  return BUYIN_FIELDS.filter((f) => fieldSupported(f, granularities));
}

// 按大类分组（保持大类顺序、组内保持源顺序）
export function groupFieldsByCat(
  source: BuyinField[],
  cats: string[]
): { cat: string; fields: BuyinField[] }[] {
  return cats.map((c) => ({ cat: c, fields: source.filter((f) => f.cat === c) }));
}

// 数据源固有缺失提示（通过支持标志天然体现，不必额外报错）
export const GRANULARITY_NOTES: Record<BuyinGranularity, string | null> = {
  day: null,
  hour: '分时粒度下退款 / GPM / 曝光 / 停留时长等指标无数据（源不支持）。',
  product: '商品粒度下分渠道 GMV / 观看次数等每日维度指标无数据（源不支持）。',
  anchor: '主播粒度无手机订单（手机订单无法拆分到主播）。',
};