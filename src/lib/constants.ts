import type { Brand, Role, ModuleKey, RoleKey } from './types';

// ==================== 品牌与账号 ====================
export const BRANDS: Brand[] = [
  {
    id: 'vivo',
    name: 'vivo',
    color: '#415FFF',
    accounts: [
      { id: 'vivo-main', brandId: 'vivo', name: 'vivo', platform: '其他' },
      { id: 'vivo-douyin', brandId: 'vivo', name: 'vivo官方旗舰店抖音', platform: '抖音' },
      { id: 'vivo-kuaishou', brandId: 'vivo', name: 'vivo官方旗舰店快手', platform: '快手' },
    ],
  },
  {
    id: 'iqoo',
    name: 'iQOO',
    color: '#FF6B35',
    accounts: [
      { id: 'iqoo-main', brandId: 'iqoo', name: 'iQOO手机', platform: '其他' },
      { id: 'iqoo-douyin', brandId: 'iqoo', name: 'iQOO官方旗舰店抖音', platform: '抖音' },
      { id: 'iqoo-kuaishou', brandId: 'iqoo', name: 'iQOO官方旗舰店快手', platform: '快手' },
    ],
  },
  {
    id: 'iot',
    name: 'IOT',
    color: '#00C9A7',
    accounts: [
      { id: 'iot-watch', brandId: 'iot', name: 'vivo智能手表直播间', platform: '其他' },
      { id: 'iot-tablet', brandId: 'iot', name: 'iQOO平板电脑直播间', platform: '其他' },
    ],
  },
];

// ==================== 角色与权限 ====================
const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: '首页概览',
  schedule: '排班管理',
  'data-report': '数据报表',
  cost: '成本核算',
  attendance: '考勤管理',
  visual: '视觉对接',
  sop: 'SOP管理',
  workstation: '主播工作台',
  'problem-feedback': '问题反馈',
};

export { MODULE_LABELS };

export const ROLES: Role[] = [
  {
    key: 'PM',
    label: '项目负责人',
    modules: [
      'dashboard',
      'schedule',
      'data-report',
      'cost',
      'attendance',
      'visual',
      'sop',
      'workstation',
      'problem-feedback',
    ],
  },
  {
    key: '运营',
    label: '运营',
    modules: ['schedule', 'data-report', 'cost', 'attendance', 'visual', 'sop'],
  },
  {
    key: '中控',
    label: '中控',
    modules: ['workstation', 'problem-feedback'],
  },
  {
    key: '主播',
    label: '主播',
    modules: ['workstation'],
  },
];

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
  '全职主播成本',
  '全职中控成本',
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
