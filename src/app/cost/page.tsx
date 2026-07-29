'use client';

import { useApp } from '@/contexts/AppContext';
import { ROLES } from '@/lib/constants';
import CostPagePM from './CostPagePM';
import CostPageOps from './CostPageOps';
import { ShieldX } from 'lucide-react';

export default function CostPage() {
  const { currentRole } = useApp();

  // 权限校验：只有角色 modules 包含 cost 的用户才能访问
  const roleConfig = ROLES.find((r) => r.key === currentRole);
  const hasCostAccess = roleConfig?.modules?.includes('cost');

  if (!hasCostAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <ShieldX className="w-12 h-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">无权限访问</p>
        <p className="text-sm text-muted-foreground">当前角色「{roleConfig?.label || currentRole}」无法查看成本核算页面</p>
      </div>
    );
  }

  // 项目负责人角色显示旧版（含收入/利润），运营角色显示新版（仅成本）
  if (currentRole === 'PM') {
    return <CostPagePM />;
  }

  return <CostPageOps />;
}
