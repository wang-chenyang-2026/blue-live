import type { Brand, Role, ModuleKey, RoleKey } from './types';

// ==================== 品牌与账号（级联分组结构） ====================
// 业务线标识统一为中性徽章色（不再用颜色区分品牌）
const NEUTRAL_BRAND_COLOR = '#2A2E45';
export const BRANDS: Brand[] = [
  {
    id: 'vivo',
    name: 'vivo',
    color: NEUTRAL_BRAND_COLOR,
    accounts: [
      { id: 'vivo-main', brandId: 'vivo', name: 'vivo（大号）', platform: '其他' },
      { id: 'vivo-douyin', brandId: 'vivo', name: 'vivo官方旗舰店（抖音）', platform: '抖音' },
      { id: 'vivo-kuaishou', brandId: 'vivo', name: 'vivo官方旗舰店（快手）', platform: '快手' },
    ],
  },
  {
    id: 'iqoo',
    name: 'iQOO',
    color: NEUTRAL_BRAND_COLOR,
    groups: [
      {
        id: 'iqoo-douyin-group',
        name: 'iQOO抖音',
        accounts: [
          { id: 'iqoo-main', brandId: 'iqoo', groupId: 'iqoo-douyin-group', name: 'iQOO手机', platform: '其他' },
          { id: 'iqoo-douyin', brandId: 'iqoo', groupId: 'iqoo-douyin-group', name: 'iQOO官方旗舰店（抖音）', platform: '抖音' },
        ],
      },
      {
        id: 'iqoo-kuaishou-group',
        name: 'iQOO官方旗舰店（快手）',
        accounts: [
          { id: 'iqoo-kuaishou', brandId: 'iqoo', groupId: 'iqoo-kuaishou-group', name: 'iQOO官方旗舰店（快手）', platform: '快手' },
        ],
      },
    ],
    accounts: [
      { id: 'iqoo-main', brandId: 'iqoo', groupId: 'iqoo-douyin-group', name: 'iQOO手机', platform: '其他' },
      { id: 'iqoo-douyin', brandId: 'iqoo', groupId: 'iqoo-douyin-group', name: 'iQOO官方旗舰店（抖音）', platform: '抖音' },
      { id: 'iqoo-kuaishou', brandId: 'iqoo', groupId: 'iqoo-kuaishou-group', name: 'iQOO官方旗舰店（快手）', platform: '快手' },
    ],
  },
  {
    id: 'iot',
    name: 'IOT',
    color: NEUTRAL_BRAND_COLOR,
    accounts: [
      { id: 'iot-tablet', brandId: 'iot', name: 'IOT平板', platform: '其他' },
      { id: 'iot-watch', brandId: 'iot', name: 'IOT手表', platform: '其他' },
    ],
  },
];

// ==================== 内部分享角色 ====================
// 角色名非敏感，前端渲染需要，保留在此；手机号等敏感常量已迁移至
// `src/lib/server/internal-share.ts`（server-only），不得在此或任何客户端文件出现。
export const INTERNAL_SHARE_ROLE = '内部分享';

/** 仅超级管理员可用的模块（超管身份由服务端下发 isSuperAdmin，见 getAccessibleModules） */
const SUPER_ADMIN_ONLY_MODULES: ModuleKey[] = ['approval'];

/**
 * 根据角色 + 服务端下发的 isSuperAdmin 计算实际可访问模块。
 * 超级管理员专属模块（用户审批）对非超管隐藏。
 * isSuperAdmin 由登录/me 接口在服务端判定并随 user 返回，客户端不携带任何超管手机号字面量。
 */
export function getAccessibleModules(roleKey: RoleKey | undefined | null, isSuperAdmin = false): ModuleKey[] {
  const roleConfig = ROLES.find((r) => r.key === roleKey);
  const modules = roleConfig?.modules ? [...roleConfig.modules] : [];
  if (!isSuperAdmin) {
    return modules.filter((m) => !SUPER_ADMIN_ONLY_MODULES.includes(m));
  }
  return modules;
}

// ==================== 岗位选项 ====================
export const POSITION_OPTIONS: { value: RoleKey; label: string }[] = [
  { value: 'PM', label: '项目负责人' },
  { value: '运营', label: '运营' },
  { value: '中控', label: '中控' },
  { value: '主播', label: '主播' },
  { value: '外部合作', label: '外部合作' },
];

// ==================== 注册页面项目选项（平级） ====================
export const REGISTER_PROJECT_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'vivo', label: 'vivo' },
  { value: 'iqoo-douyin', label: 'iQOO抖音' },
  { value: 'iqoo-kuaishou', label: 'iQOO快手' },
  { value: 'iot', label: 'IOT' },
  { value: 'public', label: '公共功能' },
];

// ==================== 角色与权限 ====================
const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: '首页概览',
  schedule: '排班管理',
  'data-overview': '数据概览',
  'market-monitor': '市场监测',
  cost: '成本核算',
  visual: '视觉统计',
  sop: 'SOP管理',
  workstation: '主播工作台',
  'problem-feedback': '问题反馈',
  'personnel': '注册人员管理',
  'approval': '用户审批',
  'buyin-spike': '百应数据',
  'data-analysis': '数据分析',
  
};

export { MODULE_LABELS };

export const ROLES: Role[] = [
  {
    key: 'PM',
    label: '项目负责人',
    modules: [
      'dashboard',
      'schedule',
      'data-overview',
      'data-analysis',
      'market-monitor',
      'cost',
      'visual',
      'sop',
      'workstation',
      'problem-feedback',
      'personnel',
      'approval',
      'buyin-spike',
    ],
    brandScopedModules: [], // PM 全部品牌不受限
  },
  {
    key: '运营',
    label: '运营',
modules: ['dashboard', 'schedule', 'data-overview', 'data-analysis', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback', 'buyin-spike'],
    brandScopedModules: ['dashboard', 'schedule', 'data-overview', 'workstation'],
    // 无成本核算、注册人员管理、用户审批
  },
  {
    key: '中控',
    label: '中控',
    modules: ['schedule', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback', 'buyin-spike'],
    brandScopedModules: ['schedule'],
    // 无首页概览、成本核算、注册人员管理、用户审批
  },
  {
    key: '主播',
    label: '主播',
    modules: ['schedule', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback', 'buyin-spike'],
    brandScopedModules: ['schedule'],
    // 无首页概览、成本核算、数据概览、注册人员管理、用户审批
  },
  {
    key: '外部合作',
    label: '外部合作',
    modules: ['dashboard', 'schedule', 'data-overview', 'market-monitor', 'cost', 'visual', 'sop', 'workstation', 'problem-feedback', 'buyin-spike'],
    brandScopedModules: [],
    // 外部合作可查看全部业务模块的页面布局与数据维度，但服务端数据门控（maskExternalBusiness）返回空版本；
    // 不含注册人员管理、用户审批。项目固定为"公共功能"
  },
  {
    key: '内部分享',
    label: '内部分享',
    modules: [
      'dashboard',
      'schedule',
      'cost',
      'data-overview',
      'data-analysis',
      'buyin-spike',
      'market-monitor',
      'visual',
      'sop',
      'workstation',
      'problem-feedback',
      'personnel',
    ],
    brandScopedModules: [],
    // 内部分享（交流学习用）可看到全部业务模块的布局与真实数据；
    // 唯一例外：cost 成本核算在服务端接口层字段级脱敏（见 api-permission / cost-overview）。
    // 不含 approval（用户审批，超级管理员专属），账号管理 personnel 沿用既有权限模型（数据 403，不提权）。
  },
];

/** 路径到模块的映射，用于路由级权限守卫 */
export const PATH_TO_MODULE: Record<string, ModuleKey> = {
  '/': 'dashboard',
  '/schedule': 'schedule',
  '/data-overview': 'data-overview',
  '/market-monitor': 'market-monitor',
  '/cost': 'cost',
  '/visual': 'visual',
  '/sop': 'sop',
  '/workstation': 'workstation',
  '/feedback': 'problem-feedback',
  '/admin/user-management': 'personnel',
  '/approval': 'approval',
  '/buyin-spike': 'buyin-spike',
  '/data-analysis': 'data-analysis',
};

/** 模块到路径的反向映射 */
export const MODULE_PATHS: Record<ModuleKey, string> = {
  dashboard: '/',
  schedule: '/schedule',
  'data-overview': '/data-overview',
  'market-monitor': '/market-monitor',
  cost: '/cost',
  visual: '/visual',
  sop: '/sop',
  workstation: '/workstation',
  'problem-feedback': '/feedback',
  personnel: '/admin/user-management',
  approval: '/approval',
  'buyin-spike': '/buyin-spike',
  'data-analysis': '/data-analysis',
};

// ==================== 直播类型 & 小时费标准 ====================
export const HOURLY_RATES: Record<string, number> = {
  '日常直播': 375,
  '双人直播': 550,
  '法定节假日直播': 1012.5,
};

export const LIVE_TYPES = ['日常直播', '双人直播', '法定节假日直播'] as const;

// ==================== 话术分类 ====================
export const SCRIPT_CATEGORIES = ['开场', '产品介绍', '互动', '逼单', '收尾'] as const;

// ==================== 考勤状态 ====================
export const ATTENDANCE_STATUSES = ['正常', '迟到', '早退', '缺勤', '请假'] as const;

// ==================== 成本类别 ====================
export const COST_CATEGORIES = [
  '兼职主播成本',
  '兼职中控成本',
  '设计费分摊',
  '全职主播成本',
  '全职中控成本',
  '全职运营成本',
  '日常物料成本',
  '其它成本',
] as const;

// ==================== 辅助函数 ====================
export function getBrandById(id: string): Brand | undefined {
  return BRANDS.find((b) => b.id === id);
}

export function getAccountsByBrand(brandId: string) {
  return BRANDS.find((b) => b.id === brandId)?.accounts ?? [];
}

export function getRoleModules(roleKey: RoleKey): ModuleKey[] {
  return ROLES.find((r) => r.key === roleKey)?.modules ?? [];
}

export function getAllAccounts() {
  return BRANDS.flatMap((b) => b.accounts);
}

// iQOO 子分组 → 首页卡片元数据（首页把 iQOO 拆成「抖音/快手」两张卡）
export const IQOO_GROUP_META: Record<string, { brandKey: string; name: string }> = {
  'iqoo-douyin-group': { brandKey: 'iQOO-dy', name: 'iQOO抖音汇总' },
  'iqoo-kuaishou-group': { brandKey: 'iQOO-ks', name: 'iQOO快手汇总' },
};

// 飞书时长表 C 列账号缩写归一为标准账号名
export const ACCOUNT_ALIAS_NORMALIZE: Record<string, string> = {
  'iQOO官旗': 'iQOO官方旗舰店（抖音）',
};
