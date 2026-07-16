import type {
  ScheduleItem,
  CostItem,
  RevenueItem,
  KPIItem,
  AttendanceItem,
  Staff,
  ProductItem,
  ScriptTemplate,
  ProblemFeedback,
  User,
} from './types';
// DEFAULT_ADMIN 现由服务端 Supabase 用户表管理，本文件不再使用

// ==================== 安全 localStorage 操作 ====================
// 所有函数都假设在客户端调用，SSR 阶段由调用方通过 useEffect 保护

const isBrowser = typeof window !== 'undefined';

function getStore<T>(key: string, defaultValue: T): T {
  if (!isBrowser) return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStore<T>(key: string, value: T): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

// ==================== 人员管理 ====================
const STAFF_KEY = 'lm_staff';

export function getStaffList(): Staff[] {
  return getStore<Staff[]>(STAFF_KEY, []);
}

export function setStaffList(staff: Staff[]): void {
  setStore(STAFF_KEY, staff);
}

export function addStaff(staff: Staff): void {
  const list = getStaffList();
  list.push(staff);
  setStaffList(list);
}

export function updateStaff(staff: Staff): void {
  const list = getStaffList().map((s) => (s.id === staff.id ? staff : s));
  setStaffList(list);
}

export function deleteStaff(id: string): void {
  setStaffList(getStaffList().filter((s) => s.id !== id));
}

// ==================== 排班管理 ====================
const SCHEDULE_KEY = 'lm_schedule';

export function getScheduleList(): ScheduleItem[] {
  return getStore<ScheduleItem[]>(SCHEDULE_KEY, []);
}

export function setScheduleList(items: ScheduleItem[]): void {
  setStore(SCHEDULE_KEY, items);
}

export function addScheduleItem(item: ScheduleItem): void {
  const list = getScheduleList();
  list.push(item);
  setScheduleList(list);
}

export function updateScheduleItem(item: ScheduleItem): void {
  const list = getScheduleList().map((s) => (s.id === item.id ? item : s));
  setScheduleList(list);
}

export function deleteScheduleItem(id: string): void {
  setScheduleList(getScheduleList().filter((s) => s.id !== id));
}

/** 检测排班时间冲突：同一人在同一时段不能出现在两个账号 */
export function checkScheduleConflict(
  staffId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): ScheduleItem[] {
  const list = getScheduleList().filter(
    (s) => s.staffId === staffId && s.date === date && s.id !== excludeId
  );

  return list.filter((s) => {
    return startTime < s.endTime && endTime > s.startTime;
  });
}

// ==================== 成本核算 ====================
const COST_KEY = 'lm_cost';

export function getCostList(): CostItem[] {
  return getStore<CostItem[]>(COST_KEY, []);
}

export function setCostList(items: CostItem[]): void {
  setStore(COST_KEY, items);
}

export function addCostItem(item: CostItem): void {
  const list = getCostList();
  list.push(item);
  setCostList(list);
}

export function updateCostItem(item: CostItem): void {
  const list = getCostList().map((c) => (c.id === item.id ? item : c));
  setCostList(list);
}

export function deleteCostItem(id: string): void {
  setCostList(getCostList().filter((c) => c.id !== id));
}

export function getCostByBrandMonth(brandId: string, month: string): CostItem[] {
  return getCostList().filter((c) => c.brandId === brandId && c.month === month);
}

// ==================== 收入管理 ====================
const REVENUE_KEY = 'lm_revenue';

export function getRevenueList(): RevenueItem[] {
  return getStore<RevenueItem[]>(REVENUE_KEY, []);
}

export function setRevenueList(items: RevenueItem[]): void {
  setStore(REVENUE_KEY, items);
}

export function addRevenueItem(item: RevenueItem): void {
  const list = getRevenueList();
  list.push(item);
  setRevenueList(list);
}

export function updateRevenueItem(item: RevenueItem): void {
  const list = getRevenueList().map((r) => (r.id === item.id ? item : r));
  setRevenueList(list);
}

export function deleteRevenueItem(id: string): void {
  setRevenueList(getRevenueList().filter((r) => r.id !== id));
}

export function getRevenueByBrandMonth(brandId: string, month: string): RevenueItem[] {
  return getRevenueList().filter((r) => r.brandId === brandId && r.month === month);
}

// ==================== KPI 管理 ====================
const KPI_KEY = 'lm_kpi';

export function getKPIList(): KPIItem[] {
  return getStore<KPIItem[]>(KPI_KEY, []);
}

export function setKPIList(items: KPIItem[]): void {
  setStore(KPI_KEY, items);
}

export function addKPIItem(item: KPIItem): void {
  const list = getKPIList();
  list.push(item);
  setKPIList(list);
}

export function updateKPIItem(item: KPIItem): void {
  const list = getKPIList().map((k) => (k.id === item.id ? item : k));
  setKPIList(list);
}

export function getKPIByBrandMonth(brandId: string, month: string): KPIItem[] {
  return getKPIList().filter((k) => k.brandId === brandId && k.month === month);
}

// ==================== 考勤管理 ====================
const ATTENDANCE_KEY = 'lm_attendance';

export function getAttendanceList(): AttendanceItem[] {
  return getStore<AttendanceItem[]>(ATTENDANCE_KEY, []);
}

export function setAttendanceList(items: AttendanceItem[]): void {
  setStore(ATTENDANCE_KEY, items);
}

export function addAttendanceItem(item: AttendanceItem): void {
  const list = getAttendanceList();
  list.push(item);
  setAttendanceList(list);
}

export function updateAttendanceItem(item: AttendanceItem): void {
  const list = getAttendanceList().map((a) => (a.id === item.id ? item : a));
  setAttendanceList(list);
}

export function deleteAttendanceItem(id: string): void {
  setAttendanceList(getAttendanceList().filter((a) => a.id !== id));
}

export function getAttendanceByBrandMonth(brandId: string, month: string): AttendanceItem[] {
  return getAttendanceList().filter((a) => a.brandId === brandId && a.date.startsWith(month));
}

// ==================== 产品信息 ====================
const PRODUCT_KEY = 'lm_product';

export function getProductList(): ProductItem[] {
  return getStore<ProductItem[]>(PRODUCT_KEY, []);
}

export function setProductList(items: ProductItem[]): void {
  setStore(PRODUCT_KEY, items);
}

export function addProductItem(item: ProductItem): void {
  const list = getProductList();
  list.push(item);
  setProductList(list);
}

export function updateProductItem(item: ProductItem): void {
  const list = getProductList().map((p) => (p.id === item.id ? item : p));
  setProductList(list);
}

export function deleteProductItem(id: string): void {
  setProductList(getProductList().filter((p) => p.id !== id));
}

export function getProductsByBrand(brandId: string): ProductItem[] {
  return getProductList().filter((p) => p.brandId === brandId);
}

// ==================== 话术模板 ====================
const SCRIPT_KEY = 'lm_script';

export function getScriptList(): ScriptTemplate[] {
  return getStore<ScriptTemplate[]>(SCRIPT_KEY, []);
}

export function setScriptList(items: ScriptTemplate[]): void {
  setStore(SCRIPT_KEY, items);
}

export function addScriptItem(item: ScriptTemplate): void {
  const list = getScriptList();
  list.push(item);
  setScriptList(list);
}

export function updateScriptItem(item: ScriptTemplate): void {
  const list = getScriptList().map((s) => (s.id === item.id ? item : s));
  setScriptList(list);
}

export function deleteScriptItem(id: string): void {
  setScriptList(getScriptList().filter((s) => s.id !== id));
}

export function getScriptsByBrand(brandId: string): ScriptTemplate[] {
  return getScriptList().filter((s) => s.brandId === brandId);
}

// ==================== 问题反馈 ====================
const FEEDBACK_KEY = 'lm_feedback';

export function getFeedbackList(): ProblemFeedback[] {
  return getStore<ProblemFeedback[]>(FEEDBACK_KEY, []);
}

export function setFeedbackList(items: ProblemFeedback[]): void {
  setStore(FEEDBACK_KEY, items);
}

export function addFeedbackItem(item: ProblemFeedback): void {
  const list = getFeedbackList();
  list.push(item);
  setFeedbackList(list);
}

export function updateFeedbackItem(item: ProblemFeedback): void {
  const list = getFeedbackList().map((f) => (f.id === item.id ? item : f));
  setFeedbackList(list);
}

// ==================== 利润率计算 ====================
export function calcProfitRate(brandId: string, month: string): {
  revenue: number;
  totalCost: number;
  profitRate: number;
  costs: Record<string, number>;
  kpiDeducted: boolean;
} {
  const revenues = getRevenueByBrandMonth(brandId, month);
  const costs = getCostByBrandMonth(brandId, month);
  const kpis = getKPIByBrandMonth(brandId, month);

  const totalRevenue = revenues.reduce((sum, r) => sum + r.revenue, 0);

  const costsByCategory: Record<string, number> = {};
  costs.forEach((c) => {
    costsByCategory[c.category] = (costsByCategory[c.category] || 0) + c.amount;
  });

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);

  // KPI 扣减：任何账号KPI不达标则扣5%
  const kpiDeducted = kpis.some((k) => k.isDeducted);
  const effectiveRevenue = kpiDeducted ? totalRevenue * 0.95 : totalRevenue;

  const profitRate = effectiveRevenue > 0 ? (effectiveRevenue - totalCost) / effectiveRevenue : 0;

  return {
    revenue: effectiveRevenue,
    totalCost,
    profitRate,
    costs: costsByCategory,
    kpiDeducted,
  };
}

export function calcProfitRateByAccount(brandId: string, accountId: string, month: string): {
  revenue: number;
  totalCost: number;
  profitRate: number;
  kpiDeducted: boolean;
} {
  const brandData = calcProfitRate(brandId, month);
  const revenues = getRevenueByBrandMonth(brandId, month).filter((r) => r.accountId === accountId);
  const kpis = getKPIByBrandMonth(brandId, month).filter((k) => k.accountId === accountId);

  const accountRevenue = revenues.reduce((sum, r) => sum + r.revenue, 0);
  const brandRevenue = getRevenueByBrandMonth(brandId, month).reduce((sum, r) => sum + r.revenue, 0);
  const costRatio = brandRevenue > 0 ? accountRevenue / brandRevenue : 0;
  const accountCost = brandData.totalCost * costRatio;

  const kpiDeducted = kpis.some((k) => k.isDeducted);
  const effectiveRevenue = kpiDeducted ? accountRevenue * 0.95 : accountRevenue;
  const profitRate = effectiveRevenue > 0 ? (effectiveRevenue - accountCost) / effectiveRevenue : 0;

  return {
    revenue: effectiveRevenue,
    totalCost: Math.round(accountCost),
    profitRate,
    kpiDeducted,
  };
}

// ==================== 用户 & 认证 ====================
const AUTH_KEY = 'lm_auth';

// ==================== 用户管理（存储在服务端 Supabase） ====================
// 用户数据（注册/登录/审批）已全部迁移到服务端 API，参见：
//   POST /api/auth/register
//   POST /api/auth/login
//   GET  /api/users?status=pending
//   PUT  /api/users/[id]
//   DELETE /api/users/[id]
// 本地仅保留当前登录会话的 currentUser 缓存（AUTH_KEY），退出登录时清空。

export function setCurrentUser(user: User | null): void {
  if (!isBrowser) return;
  try {
    if (user) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  } catch {
    // ignore
  }
}

export function logout(): void {
  setCurrentUser(null);
}

export function getCurrentUser(): User | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

// ==================== ID 生成 ====================
let _counter = 0;
export function genId(): string {
  // 避免在 SSR 时使用 Date.now() 导致不一致
  _counter++;
  const timestamp = isBrowser ? Date.now().toString(36) : 'ssr';
  return timestamp + Math.random().toString(36).substring(2, 7) + _counter.toString(36);
}

// ==================== 安全日期工具 ====================
/** 获取当前年月字符串，SSR 安全 */
export function getCurrentMonth(): string {
  if (!isBrowser) return '2025-01'; // SSR 固定值，不参与渲染
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 获取当前日期字符串，SSR 安全 */
export function getCurrentDate(): string {
  if (!isBrowser) return '2025-01-01'; // SSR 固定值，不参与渲染
  return new Date().toISOString().split('T')[0];
}
