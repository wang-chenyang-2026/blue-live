/**
 * SOP v2.5 分发统计：按业务线实时统计内部相关人员数量与构成。
 * 真实口径（来自 users 表，status=approved，排除「外部合作」），不存假值、不落库。
 * - general：全部内部人员（PM/运营/中控/主播）
 * - 品牌线（vivo / iqoo_douyin / iqoo_kuaishou）：brand 匹配者；其中 PM/运营品牌为空默认计入全部业务线
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { brandToScope, Scope } from '@/lib/sop-taxonomy';

const INTERNAL_ROLES = ['PM', '运营', '中控', '主播'];

export interface ScopeSyncStats {
  total: number;
  anchor: number; // 主播
  ops: number; // 运营
  pm: number; // 项目负责人
  mid: number; // 中控
}

interface RawUser {
  role: string;
  brand: string | null;
}

async function getApprovedInternalUsers(): Promise<RawUser[]> {
  try {
    const { data } = await getSupabaseClient()
      .from('users')
      .select('role, brand')
      .eq('status', 'approved');
    return (data ?? []) as unknown as RawUser[];
  } catch {
    return [];
  }
}

/** 某用户是否属于指定业务线的相关人员。 */
function userInScope(u: RawUser, scope: Scope): boolean {
  if (!INTERNAL_ROLES.includes(u.role)) return false;
  if (scope === 'general') return true;
  const own = brandToScope(u.brand);
  if (own === scope) return true;
  // PM/运营品牌为空（或为 'all'）时默认管理全部业务线
  const bare = !u.brand || u.brand === 'all' || u.brand === 'ALL';
  if ((u.role === 'PM' || u.role === '运营') && bare) return true;
  return false;
}

/** 统计某业务线相关人员构成。 */
export async function computeScopeSync(scope: string): Promise<ScopeSyncStats> {
  const users = await getApprovedInternalUsers();
  const stats: ScopeSyncStats = { total: 0, anchor: 0, ops: 0, pm: 0, mid: 0 };
  for (const u of users) {
    if (!userInScope(u, scope as Scope)) continue;
    stats.total += 1;
    if (u.role === '主播') stats.anchor += 1;
    else if (u.role === '运营') stats.ops += 1;
    else if (u.role === 'PM') stats.pm += 1;
    else if (u.role === '中控') stats.mid += 1;
  }
  return stats;
}

/** 一次拉取多个业务线的分发统计（去重计算）。 */
export async function getScopeSyncStats(scopes: string[]): Promise<Map<string, ScopeSyncStats>> {
  const users = await getApprovedInternalUsers();
  const map = new Map<string, ScopeSyncStats>();
  const unique = Array.from(new Set(scopes.filter(Boolean) as string[]));
  for (const scope of unique) {
    const stats: ScopeSyncStats = { total: 0, anchor: 0, ops: 0, pm: 0, mid: 0 };
    for (const u of users) {
      if (!userInScope(u, scope as Scope)) continue;
      stats.total += 1;
      if (u.role === '主播') stats.anchor += 1;
      else if (u.role === '运营') stats.ops += 1;
      else if (u.role === 'PM') stats.pm += 1;
      else if (u.role === '中控') stats.mid += 1;
    }
    map.set(scope, stats);
  }
  return map;
}

/** 详情 chip 展示文案：主播 X · 运营 Y · 中控 Z（PM 计入运营，口径以此处为准）。 */
export function formatSyncDetail(stats: ScopeSyncStats): string {
  const parts = [
    `主播 ${stats.anchor}`,
    `运营 ${stats.ops + stats.pm}`,
    `中控 ${stats.mid}`,
  ];
  return parts.join(' · ');
}

/** 分发状态文案：已提炼→已同步 N 人；提炼中→待提炼完成后分发；其余（待补充/失败）→未分发 */
export function syncStatusLabel(aiStatus: string | null, stats: ScopeSyncStats): string {
  if (aiStatus === 'done') return `已同步 ${stats.total} 人`;
  if (aiStatus === 'processing') return '待提炼完成后分发';
  return '未分发';
}