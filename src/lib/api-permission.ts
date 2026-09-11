import { NextRequest, NextResponse } from 'next/server';
import { SUPER_ADMIN_PHONE } from '@/lib/constants';

/**
 * 从请求头读取登录用户手机号（由 middleware 注入，已鉴权）。
 */
export function getRequestPhone(request: NextRequest): string | null {
  return request.headers.get('x-user-phone');
}

/**
 * 校验当前登录用户是否为超级管理员（仅王晨阳本人）。
 * 用于「用户审批」等专属接口的服务端权限控制。
 * 非超级管理员返回 403 响应；通过时返回 null。
 */
export function requireSuperAdmin(request: NextRequest): NextResponse | null {
  const phone = getRequestPhone(request);
  if (phone !== SUPER_ADMIN_PHONE) {
    return NextResponse.json(
      { error: '无权限：仅超级管理员可操作用户审批' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * 从请求头读取登录用户角色（middleware 注入的 x-user-role 是 URL 编码的中文）。
 */
export function getRequestRole(request: NextRequest | Request): string {
  const raw = request.headers.get('x-user-role') || '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** 是否「外部合作」角色（数据门控的唯一判定条件）。 */
export function isExternalRoleRequest(request: NextRequest | Request): boolean {
  return getRequestRole(request) === '外部合作';
}

// —— 外部合作角色的服务端数据门控 ——
// 对 8 个业务模块返回经营数值/明细的数据 API，当请求来自「外部合作」时返回
// HTTP 200 + 与该接口正常成功时相同 JSON 结构的「空版本」（列表 []、数值 0），
// 让前端渲染出「有表头/有维度但无数据」的空态，不报错、不白屏。

interface SheetsMeta {
  accounts: string[];
  brandLabel: string;
  color: string;
}

const SHEETS_META: Record<string, SheetsMeta> = {
  vivo: {
    accounts: ['vivo（大号）', 'vivo官方旗舰店（抖音）', 'vivo官方旗舰店（快手）'],
    brandLabel: 'vivo',
    color: '#415FFF',
  },
  iQOO: {
    accounts: ['iQOO手机', 'iQOO官方旗舰店（抖音）', 'iQOO官方旗舰店（快手）'],
    brandLabel: 'iQOO',
    color: '#FF6B35',
  },
  IOT: {
    accounts: ['IOT平板', 'IOT手表'],
    brandLabel: 'IOT',
    color: '#00C9A7',
  },
};

function emptySheetsBrand(meta: SheetsMeta) {
  return {
    brandSummary: { gmv: '0', salesCount: '0', rawGmv: 0, rawSales: 0 },
    accountSummaries: meta.accounts.map((accountName: string) => ({
      accountName,
      gmv: '0',
      salesCount: '0',
      rawGmv: 0,
      rawSales: 0,
    })),
    dailyData: [],
    dailySummary: { duration: '0小时', gmv: '0', salesBeforeReturn: '0', salesAfterReturn: '0' },
    kpiTabs: [],
    accounts: meta.accounts,
    brandLabel: meta.brandLabel,
    color: meta.color,
    hasData: false,
  };
}

const EMPTY_BRAND_STATS = {
  totalHours: 0,
  scheduleHours: 0,
  partTimeAnchor: 0,
  partTimeControl: 0,
  crossCheck: { severity: 'ok', ratio: null, messages: [] },
};

/**
 * 若请求来自「外部合作」角色，对业务数据接口返回空版本（HTTP 200）；否则返回 null 走原有逻辑。
 * 纯维度/枚举/配置类接口（如 /api/market-monitor/categories 品类树、平台枚举、月份范围等）
 * 不在此门控名单中，可正常返回，让外部合作看到「有哪些分析角度」。
 */
export function maskExternalBusiness(request: NextRequest | Request): NextResponse | null {
  if (!isExternalRoleRequest(request)) return null;

  const url = new URL(request.url);
  const path = url.pathname;
  const brand = url.searchParams.get('brand') || 'vivo';

  let payload: unknown;

  if (path === '/api/schedule') {
    payload = {
      success: true,
      data: {
        dates: [],
        globalStats: {
          totalPersonDays: 0,
          totalHours: 0,
          totalEarlyMorning: 0,
          totalDualBroadcast: 0,
          totalDays: 0,
        },
        brand,
        role: '',
      },
    };
  } else if (path === '/api/brand-schedule-stats') {
    payload = {
      success: true,
      data: {
        month: '',
        start: '',
        end: '',
        brands: { vivo: EMPTY_BRAND_STATS, iQOO: EMPTY_BRAND_STATS, IOT: EMPTY_BRAND_STATS },
      },
    };
  } else if (path === '/api/cost-overview') {
    const dim = { total: 0, details: [] };
    payload = {
      success: true,
      data: {
        month: '',
        brand,
        dateRange: { start: '', end: '' },
        dimensions: { anchor: dim, control: dim, fulltime: dim, purchase: dim, design: dim },
        fulltimeRules: '',
        notes: [],
        totalCost: 0,
        byBrand: {},
      },
    };
  } else if (path === '/api/market') {
    payload = { success: true, data: {} };
  } else if (path === '/api/feishu/sheets-data') {
    if (brand === 'all') {
      payload = {
        success: true,
        mode: 'all',
        data: {
          vivo: emptySheetsBrand(SHEETS_META.vivo),
          iQOO: emptySheetsBrand(SHEETS_META.iQOO),
          IOT: emptySheetsBrand(SHEETS_META.IOT),
        },
      };
    } else {
      const meta = SHEETS_META[brand] || SHEETS_META.vivo;
      payload = { success: true, mode: 'single', brand, data: emptySheetsBrand(meta) };
    }
  } else if (path === '/api/feishu/visual-stats') {
    payload = { success: true, data: [] };
  } else if (path === '/api/market-monitor/brands') {
    payload = { success: true, data: [] };
  } else if (path === '/api/market-monitor/brand/crawler') {
    payload = { success: true, data: { columns: [], data: [] } };
  } else if (path === '/api/market-monitor/chat') {
    payload = { success: true, data: { reply: '', dataType: 'text', data: [], service: '', tool: '' } };
  } else if (
    path.endsWith('/api/market-monitor/brand/voice/tasks') ||
    path.endsWith('/api/market-monitor/social-monitor/tasks') ||
    path.endsWith('/api/market-monitor/social-insight/tasks') ||
    path.endsWith('/api/market-monitor/kol/tasks')
  ) {
    payload = { success: true, data: [] };
  } else if (
    path.endsWith('/api/market-monitor/brand/voice/task-result') ||
    path.endsWith('/api/market-monitor/brand/voice/brief-result') ||
    path.endsWith('/api/market-monitor/social-monitor/task-result') ||
    path.endsWith('/api/market-monitor/social-insight/brief-result') ||
    path.endsWith('/api/market-monitor/kol/task-result')
  ) {
    payload = { success: true, data: {} };
  } else if (path.startsWith('/api/users')) {
    return NextResponse.json({ error: '该账号无权访问用户管理' }, { status: 403 });
  } else {
    return null;
  }

  return NextResponse.json(payload);
}
