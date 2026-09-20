/**
 * SOP 板块 v2 两级分类与权限常量。
 * 一级=业务域 scope，二级=内容类目 sub_category。页面优先以本文件常量驱动，
 * 旧的 sop_categories 字典表保留不动，不再作为主过滤源。
 */

export const SCOPE_OPTIONS = [
  { value: 'general', label: '通用' },
  { value: 'vivo', label: 'vivo' },
  { value: 'iqoo_douyin', label: 'iQOO抖音' },
  { value: 'iqoo_kuaishou', label: 'iQOO快手' },
] as const;

export type Scope = (typeof SCOPE_OPTIONS)[number]['value'];

export function scopeLabel(scope: string): string {
  return SCOPE_OPTIONS.find((s) => s.value === scope)?.label ?? scope;
}

export const SUB_CATEGORY_OPTIONS = [
  { value: 'product', label: '产品知识' },
  { value: 'culture', label: '企业文化' },
  { value: 'management', label: '日常管理' },
  { value: 'live_standard', label: '直播标准' },
  { value: 'other', label: '其它' },
] as const;

export type SubCategory = (typeof SUB_CATEGORY_OPTIONS)[number]['value'];

export function subCategoryLabel(key: string): string {
  return SUB_CATEGORY_OPTIONS.find((s) => s.value === key)?.label ?? key;
}

export const SOURCE_TYPE_OPTIONS = [
  { value: 'feishu', label: '飞书' },
  { value: 'tencent', label: '腾讯文档' },
  { value: 'manual', label: '手动维护' },
] as const;

/** 由链接判断来源：飞书 / 腾讯文档 / 手动。 */
export function detectSourceType(url: string): (typeof SOURCE_TYPE_OPTIONS)[number]['value'] {
  if (!url) return 'manual';
  const lower = url.toLowerCase();
  if (lower.includes('feishu.cn') || lower.includes('larksuite.com')) return 'feishu';
  if (lower.includes('docs.qq.com')) return 'tencent';
  return 'manual';
}

/** 仅 PM、运营、超级管理员可上传/编辑。 */
export const UPLOADABLE_ROLES = ['PM', '运营', '超级管理员'];

export function canUpload(role: string): boolean {
  return UPLOADABLE_ROLES.includes(role);
}

/**
 * 由 users.brand 值映射到可见的一级业务域。
 * users.brand 取自 BRAND_OPTIONS 的 value（vivo / iqoo-douyin / iqoo-kuaishou），
 * 与 SOP scope 枚举（vivo / iqoo_douyin / iqoo_kuaishou）存在下划线差异，这里统一归一。
 */
const BRAND_TO_SCOPE: Record<string, Scope> = {
  vivo: 'vivo',
  'iqoo-douyin': 'iqoo_douyin',
  iqoo_douyin: 'iqoo_douyin',
  'iqoo-kuaishou': 'iqoo_kuaishou',
  iqoo_kuaishou: 'iqoo_kuaishou',
};

export function brandToScope(brand: string | null | undefined): Scope | null {
  if (!brand) return null;
  return BRAND_TO_SCOPE[brand] ?? null;
}

/**
 * 计算某内部角色可见的 scope 集合。
 * PM/运营/超级管理员：全部 4 域；其他内部角色：general + 与自身 brand 匹配的域；
 * brand 为空/异常时仅 general。
 */
export function visibleScopes(role: string, brand: string | null | undefined): Scope[] {
  if (UPLOADABLE_ROLES.includes(role)) {
    return SCOPE_OPTIONS.map((s) => s.value);
  }
  const own = brandToScope(brand);
  const scopes: Scope[] = ['general'];
  if (own && !scopes.includes(own)) scopes.push(own);
  return scopes;
}