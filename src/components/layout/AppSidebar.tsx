'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { ROLES, MODULE_LABELS, BRANDS, REGISTER_PROJECT_OPTIONS } from '@/lib/constants';
import type { ModuleKey, RoleKey } from '@/lib/types';
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  DollarSign,
  Palette,
  BookOpen,
  MonitorPlay,
  MessageSquareWarning,
  Users,
  UserCheck,
  UserCog,
  LogOut,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const MODULE_ICONS: Record<ModuleKey, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  schedule: <CalendarDays className="h-4 w-4" />,
  'data-overview': <BarChart3 className="h-4 w-4" />,
  'market-monitor': <TrendingUp className="h-4 w-4" />,
  cost: <DollarSign className="h-4 w-4" />,
  visual: <Palette className="h-4 w-4" />,
  sop: <BookOpen className="h-4 w-4" />,
  workstation: <MonitorPlay className="h-4 w-4" />,
  'problem-feedback': <MessageSquareWarning className="h-4 w-4" />,
  personnel: <Users className="h-4 w-4" />,
  approval: <UserCheck className="h-4 w-4" />,
};

const MODULE_PATHS: Record<ModuleKey, string> = {
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

const SIDEBAR_ORDER: ModuleKey[] = [
  'dashboard',
  'schedule',
  'cost',
  'data-overview',
  'market-monitor',
  'visual',
  'sop',
  'workstation',
  'problem-feedback',
  'personnel',
];

export function AppSidebar() {
  const pathname = usePathname();
  const { currentRole, currentUser, pendingCount, handleLogout } = useApp();

  // 先从 context 的 currentRole 查找，再 fallback 到 currentUser.role
  const resolvedRole = currentRole || currentUser?.role;
  const roleConfig = ROLES.find((r) => r.key === resolvedRole);

  // 防御：如果角色配置找不到，显示提示而非错误模块
  const allowedModules: ModuleKey[] = roleConfig?.modules ?? [];
  const visibleModules = SIDEBAR_ORDER.filter((m) => allowedModules.includes(m));

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <MonitorPlay className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-foreground">Blue直播</h1>
          <p className="text-[10px] text-muted-foreground">管理平台</p>
        </div>
      </div>

      {/* User info */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 rounded-md bg-secondary px-2 py-1.5">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">当前角色：</span>
          <span className="text-xs font-medium text-foreground">{roleConfig?.label}</span>
        </div>
        {currentUser && (
          <div className="text-xs text-muted-foreground truncate px-1">
            {currentUser.name} · {currentUser.phone || '未绑定手机'}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {!roleConfig && resolvedRole && (
          <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 rounded-lg mb-2">
            角色配置异常: {resolvedRole}
          </div>
        )}
        {visibleModules.map((mod) => {
          const path = MODULE_PATHS[mod];
          const isActive =
            mod === 'dashboard' ? pathname === '/' : pathname.startsWith(path);

          return (
            <Link
              key={mod}
              href={path}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {MODULE_ICONS[mod]}
              {MODULE_LABELS[mod]}
            </Link>
          );
        })}

        {/* 审批入口 - 仅PM可见 */}
        {currentRole === 'PM' && (
          <Link
            href="/approval"
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              pathname.startsWith('/approval')
                ? 'bg-primary/15 text-primary font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <UserCheck className="h-4 w-4" />
            用户审批
          </Link>
        )}

        
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4 space-y-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
              <UserCog className="h-4 w-4" />
              账号管理
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-64 p-0 border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-xs text-muted-foreground">账号信息</div>
            </div>
            <div className="px-4 py-3 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground shrink-0">姓名</span>
                <span className="text-foreground font-medium text-right break-all">{currentUser?.name || '-'}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground shrink-0">手机号</span>
                <span className="text-foreground font-medium text-right break-all">{currentUser?.phone || '-'}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground shrink-0">角色</span>
                <span className="text-foreground font-medium text-right break-all">{roleConfig?.label || currentRole}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="text-muted-foreground shrink-0">所属项目</span>
                <span className="text-foreground font-medium text-right break-all">
                  {(() => {
                    const scope = currentUser?.projectScope || '';
                    if (!scope) return '-';
                    if (scope === 'all') return '全部项目';
                    // 支持逗号分隔的多品牌
                    const parts = scope.split(',').map(s => s.trim()).filter(Boolean);
                    const labels = parts.map(p => {
                      const opt = REGISTER_PROJECT_OPTIONS.find((o) => o.value === p);
                      if (opt) return opt.label;
                      const brand = BRANDS.find((b) => b.id === p);
                      if (brand) return brand.name;
                      return p;
                    });
                    return [...new Set(labels)].join('、');
                  })()}
                </span>
              </div>
            </div>
            <div className="border-t border-border p-2">
              <button
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
            </div>
          </PopoverContent>
        </Popover>
        <p className="text-[10px] text-muted-foreground text-center">
          &copy; 2025 Blue直播
        </p>
      </div>
    </aside>
  );
}

export function RoleSwitcher() {
  const { currentRole, setCurrentRole } = useApp();

  return (
    <div className="flex items-center gap-1">
      {ROLES.map((role) => (
        <button
          key={role.key}
          onClick={() => setCurrentRole(role.key as RoleKey)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            currentRole === role.key
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
        >
          {role.label}
        </button>
      ))}
    </div>
  );
}

export function BrandSwitcher() {
  const { currentBrand, setCurrentBrand } = useApp();

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  const handleBrandChange = (value: string) => {
    setCurrentBrand(value);
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-1">品牌</span>
      <button
        onClick={() => handleBrandChange('all')}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs transition-colors',
          currentBrand === 'all'
            ? 'bg-foreground/15 text-foreground font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
        )}
      >
        汇总
      </button>
      {BRANDS.map((brand) => (
        <button
          key={brand.id}
          onClick={() => handleBrandChange(brand.id)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs transition-colors flex items-center gap-1.5',
            currentBrand === brand.id
              ? 'font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          )}
          style={
            currentBrand === brand.id
              ? { backgroundColor: brandColors[brand.id] + '25', color: brandColors[brand.id] }
              : undefined
          }
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: brandColors[brand.id] }}
          />
          {brand.name}
        </button>
      ))}
    </div>
  );
}
