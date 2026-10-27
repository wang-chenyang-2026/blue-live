/**
 * 成本模块字段级脱敏工具。
 * - deepMaskNumbers：服务端用——把对象里所有 number 叶子替换为脱敏占位 "***"，
 *   保证内部分享角色通过任意接口都拿不到真实成本数字（含明细/汇总/图表数据值）。
 * - deepZeroNumbers：客户端用——把 number 叶子归零，避免内部分享账号在前端做
 *   利润率/占比等数值运算得到 NaN；页面显示统一由 masked 标志渲染为 *。
 */

export type { };

/** 深拷贝并把所有 number 叶子替换为 "***"（字符串占位）。 */
export function deepMaskNumbers<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return '***' as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepMaskNumbers(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = deepMaskNumbers((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * 深拷贝并把所有"数值叶子"归零，供客户端在 masked 状态下安全计算。
 * 服务端脱敏把 number 换成了字符串 "***"，因此这里既要处理 number 也要把脱敏占位
 * "***" 归零，保证下游对任意字段调用 toFixed/算术/比较都拿到真实 number（0），
 * 不会因字符串没有 toFixed 而崩溃，也不会产生 NaN。展示仍由 masked 门控渲染为 *。
 */
export function deepZeroNumbers<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'number') return 0 as unknown as T;
  if (value === '***') return 0 as unknown as T;
  if (Array.isArray(value)) return value.map((v) => deepZeroNumbers(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = deepZeroNumbers((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}