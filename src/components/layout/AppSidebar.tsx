'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/contexts/AppContext';
import { ROLES, MODULE_LABELS, BRANDS } from '@/lib/constants';
import type { ModuleKey, RoleKey } from '@/lib/types';
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  DollarSign,
  ClipboardCheck,
  Palette,
  BookOpen,
  MonitorPlay,
  MessageSquareWarning,
  UserCheck,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const MODULE_ICONS: Record<ModuleKey, React.ReactNode> = {
  dashboard: <LayoutDashboard className="h-4 w-4" />,
  schedule: <CalendarDays className="h-4 w-4" />,
  'data-report': <BarChart3 className="h-4 w-4" />,
  cost: <DollarSign className="h-4 w-4" />,
  attendance: <ClipboardCheck className="h-4 w-4" />,
  visual: <Palette className="h-4 w-4" />,
  sop: <BookOpen className="h-4 w-4" />,
  workstation: <MonitorPlay className="h-4 w-4" />,
  'problem-feedback': <MessageSquareWarning className="h-4 w-4" />,
};

const MODULE_PATHS: Record<ModuleKey, string> = {
  dashboard: '/',
  schedule: '/schedule',
  'data-report': '/data-report',
  cost: '/cost',
  attendance: '/attendance',
  visual: '/visual',
  sop: '/sop',
  workstation: '/workstation',
  'problem-feedback': '/feedback',
};

const SIDEBAR_ORDER: ModuleKey[] = [
  'dashboard',
  'schedule',
  'cost',
  'attendance',
  'data-report',
  'visual',
  'sop',
  'workstation',
  'problem-feedback',
];

export function AppSidebar() {
  const pathname = usePathname();
  const { currentRole, currentUser, pendingCount, handleLogout } = useApp();

  const roleConfig = ROLES.find((r) => r.key === currentRole);
  const allowedModules = roleConfig?.modules ?? [];
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
            {currentUser.name} · {currentUser.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
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
            <span className="flex-1">用户审批</span>
            {pendingCount > 0 && (
              <Badge className="h-5 min-w-[20px] flex items-center justify-center px-1 text-[10px] bg-destructive text-destructive-foreground">
                {pendingCount}
              </Badge>
            )}
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-4 space-y-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
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
  const { currentBrand, currentAccount, setCurrentBrand, setCurrentAccount } = useApp();

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  // 获取当前品牌下的账号列表（考虑分组）
  const currentBrandData = BRANDS.find((b) => b.id === currentBrand);

  const handleBrandChange = (value: string) => {
    setCurrentBrand(value);
  };

  const handleAccountChange = (value: string) => {
    setCurrentAccount(value);
  };

  return (
    <div className="flex items-center gap-3">
      {/* 品牌选择 */}
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

      {/* 账号级联选择器 - 仅选中品牌时显示 */}
      {currentBrand !== 'all' && currentBrandData && currentBrandData.accounts.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">账号</span>
          <Select value={currentAccount} onValueChange={handleAccountChange}>
            <SelectTrigger className="h-7 w-auto min-w-[140px] text-xs bg-card border-border">
              <SelectValue placeholder="全部账号" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部账号</SelectItem>
              {currentBrandData.groups && currentBrandData.groups.length > 0 ? (
                currentBrandData.groups.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel className="text-xs text-muted-foreground">
                      {group.name}
                    </SelectLabel>
                    {group.accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id} className="text-xs">
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))
              ) : (
                currentBrandData.accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id} className="text-xs">
                    {account.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
