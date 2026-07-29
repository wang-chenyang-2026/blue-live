'use client';

import { useApp } from '@/contexts/AppContext';
import CostPagePM from './CostPagePM';
import CostPageOps from './CostPageOps';

export default function CostPage() {
  const { currentRole } = useApp();

  // 项目负责人角色显示旧版（含收入/利润），运营角色显示新版（仅成本）
  if (currentRole === 'PM') {
    return <CostPagePM />;
  }

  return <CostPageOps />;
}
