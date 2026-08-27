import type { Brand, Role, ModuleKey, RoleKey, User } from './types';

// ==================== 品牌与账号（级联分组结构） ====================
export const BRANDS: Brand[] = [
  {
    id: 'vivo',
    name: 'vivo',
    color: '#415FFF',
    accounts: [
      { id: 'vivo-main', brandId: 'vivo', name: 'vivo（大号）', platform: '其他' },
      { id: 'vivo-douyin', brandId: 'vivo', name: 'vivo官方旗舰店（抖音）', platform: '抖音' },
      { id: 'vivo-kuaishou', brandId: 'vivo', name: 'vivo官方旗舰店（快手）', platform: '快手' },
    ],
  },
  {
    id: 'iqoo',
    name: 'iQOO',
    color: '#FF6B35',
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
    color: '#00C9A7',
    accounts: [
      { id: 'iot-tablet', brandId: 'iot', name: 'IOT平板', platform: '其他' },
      { id: 'iot-watch', brandId: 'iot', name: 'IOT手表', platform: '其他' },
    ],
  },
];

// ==================== 默认管理员 ====================
export const DEFAULT_ADMIN: User = {
  id: 'admin-default',
  name: '王晨阳',
  phone: '18333685049',
  password: 'wcy861937877',
  projectScope: 'all',
  role: 'PM',
  status: 'approved',
  createdAt: '2025-01-01',
};

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
      'market-monitor',
      'cost',
      'visual',
      'sop',
      'workstation',
      'problem-feedback',
      'personnel',
      'approval',
    ],
    brandScopedModules: [], // PM 全部品牌不受限
  },
  {
    key: '运营',
    label: '运营',
    modules: ['dashboard', 'schedule', 'data-overview', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback'],
    brandScopedModules: ['dashboard', 'schedule', 'data-overview', 'workstation'],
    // 无成本核算、注册人员管理、用户审批
  },
  {
    key: '中控',
    label: '中控',
    modules: ['data-overview', 'schedule', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback'],
    brandScopedModules: ['schedule', 'data-overview'],
    // 无首页概览、成本核算、注册人员管理、用户审批
  },
  {
    key: '主播',
    label: '主播',
    modules: ['schedule', 'market-monitor', 'visual', 'sop', 'workstation', 'problem-feedback'],
    brandScopedModules: ['schedule'],
    // 无首页概览、成本核算、数据概览、注册人员管理、用户审批
  },
  {
    key: '外部合作',
    label: '外部合作',
    modules: ['market-monitor', 'problem-feedback'],
    brandScopedModules: [],
    // 仅有市场监测、问题反馈；项目固定为"公共功能"
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
