'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { getPendingUsers, approveUser, rejectUser } from '@/lib/store';
import { BRANDS, POSITION_OPTIONS } from '@/lib/constants';
import type { User } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { useCallback } from 'react';

export default function ApprovalPage() {
  const { isClient, currentUser, refreshPendingCount } = useApp();
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadPending = useCallback(() => {
    setPendingUsers(getPendingUsers());
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    if (!isClient) return;
    loadPending();

    // 1) 监听同浏览器跨 tab 的 storage 变化
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lm_users' || e.key === null) loadPending();
    };
    window.addEventListener('storage', onStorage);

    // 2) 页面聚焦时刷新（用户切回该 tab 时）
    const onFocus = () => loadPending();
    window.addEventListener('focus', onFocus);

    // 3) 兜底轮询（每 5 秒刷一次，仅在此页面存在时）
    const timer = setInterval(loadPending, 5000);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [isClient, loadPending]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    loadPending();
    setTimeout(() => setRefreshing(false), 400);
  };

  const handleApprove = (userId: string) => {
    approveUser(userId);
    loadPending();
  };

  const handleReject = (userId: string) => {
    rejectUser(userId);
    loadPending();
  };

  if (!isClient) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      </div>
    );
  }

  const getProjectName = (scope: string) => {
    if (scope === 'all') return '全部';
    for (const brand of BRANDS) {
      for (const account of brand.accounts) {
        if (account.id === scope) return `${brand.name} - ${account.name}`;
      }
    }
    return scope;
  };

  const getPositionLabel = (role: string) => {
    return POSITION_OPTIONS.find((o) => o.value === role)?.label ?? role;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <UserCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">用户审批</h1>
            <p className="text-sm text-muted-foreground mt-1">
              审核新注册用户，通过后方可登录使用
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {pendingUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">暂无待审核用户</p>
          <p className="text-xs text-muted-foreground/60 mt-1">所有注册申请均已处理</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pendingUsers.map((user) => (
            <div
              key={user.id}
              className="rounded-xl border border-border bg-card p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary font-bold">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.phone}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 ml-13 pl-13">
                    <Badge variant="secondary" className="text-xs">
                      {getProjectName(user.projectScope)}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getPositionLabel(user.role)}
                    </Badge>
                    <Badge variant="outline" className="text-xs border-yellow-600/30 text-yellow-600">
                      <Clock className="h-3 w-3 mr-1" />
                      待审核
                    </Badge>
                  </div>

                  <p className="text-xs text-muted-foreground ml-13 pl-13">
                    注册时间：{user.createdAt}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(user.id)}
                    className="gap-1"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    通过
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleReject(user.id)}
                    className="gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    拒绝
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
