// ==================== 品牌 & 账号 ====================
export interface Brand {
  id: string;
  name: string;
  color: string; // 品牌主题色
  accounts: Account[];
  groups?: AccountGroup[]; // 账号分组（iQOO下有子分组）
}

export interface AccountGroup {
  id: string;
  name: string;
  accounts: Account[];
}

export interface Account {
  id: string;
  brandId: string;
  groupId?: string; // 所属分组
  name: string;
  platform: '抖音' | '快手' | '其他';
}

// ==================== 用户 & 认证 ====================
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'terminated';

export interface User {
  id: string;
  name: string;
  phone: string;
  password: string;
  projectScope: string; // 'all' | accountId
  role: RoleKey;
  status: UserStatus;
  createdAt: string;
}

// ==================== 人员 ====================
export type StaffType = '全职' | '兼职';
export type StaffRole = '主播' | '中控';

export interface Staff {
  id: string;
  name: string;
  type: StaffType;
  role: StaffRole;
  phone?: string;
  brandIds: string[]; // 所属品牌（全职只属于一个品牌，兼职可跨品牌）
}

// ==================== 角色 & 权限 ====================
export type RoleKey = 'PM' | '运营' | '中控' | '主播';

export interface Role {
  key: RoleKey;
  label: string;
  modules: ModuleKey[];
}

export type ModuleKey =
  | 'dashboard'
  | 'schedule'
  | 'data-overview'
  | 'cost'
  | 'visual'
  | 'sop'
  | 'workstation'
  | 'problem-feedback'
  | 'personnel'
  | 'approval'
  | 'account';

// ==================== 排班 ====================
export type LiveType = '日常直播' | '双人直播' | '法定节假日直播';

export interface ScheduleItem {
  id: string;
  accountId: string;
  brandId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  staffId: string; // 主播或中控ID
  staffRole: StaffRole;
  liveType: LiveType;
  remark?: string;
}

// ==================== 成本核算 ====================
export interface CostItem {
  id: string;
  brandId: string;
  month: string; // YYYY-MM
  category: CostCategory;
  amount: number;
  remark?: string;
}

export type CostCategory =
  | '兼职主播成本'
  | '兼职中控成本'
  | '全职主播成本'
  | '全职中控成本'
  | '日常物料成本'
  | '其它成本';

// ==================== 收入 ====================
export interface RevenueItem {
  id: string;
  brandId: string;
  month: string; // YYYY-MM
  accountId: string;
  liveType: LiveType;
  hours: number; // 时长
  hourlyRate: number; // 小时费
  revenue: number; // 收入 = hours * hourlyRate
  remark?: string;
}

// ==================== KPI ====================
export interface KPIItem {
  id: string;
  brandId: string;
  month: string; // YYYY-MM
  accountId: string;
  metrics: {
    exposureEnterRate: number; // 曝光进入率（人数）
    exposureEnterRateCount: number; // 曝光进入率（次数）
    gpm: number; // GPM
    avgStayDuration: number; // 停留时长（秒）
    followRate: number; // 转粉率
  };
  targetMetrics: {
    exposureEnterRate: number;
    exposureEnterRateCount: number;
    gpm: number;
    avgStayDuration: number;
    followRate: number;
  };
  isDeducted: boolean; // 是否扣减5%
  remark?: string;
}

// ==================== 考勤 ====================
export type AttendanceStatus = '正常' | '迟到' | '早退' | '缺勤' | '请假';

export interface AttendanceItem {
  id: string;
  staffId: string;
  brandId: string;
  date: string; // YYYY-MM-DD
  scheduledStart: string; // 排班开始时间
  scheduledEnd: string; // 排班结束时间
  actualStart?: string; // 实际签到时间
  actualEnd?: string; // 实际签退时间
  status: AttendanceStatus;
  remark?: string;
}

// ==================== 主播工作台 ====================
export interface ProductItem {
  id: string;
  brandId: string;
  name: string;
  category: string;
  price: number;
  features: string[]; // 卖点列表
  description?: string;
  imageUrl?: string;
}

export interface ScriptTemplate {
  id: string;
  brandId: string;
  productId?: string;
  title: string;
  content: string;
  category: string; // 话术分类：开场、产品介绍、互动、逼单、收尾
  createdAt: string;
  updatedAt: string;
}

// ==================== 问题反馈 ====================
export interface ProblemFeedback {
  id: string;
  brandId: string;
  accountId: string;
  staffId: string;
  date: string;
  content: string;
  status: '待处理' | '已处理';
  reply?: string;
}
