'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCcw, UsersRound } from 'lucide-react';

interface UserRow {
  id: string;
  name: string | null;
  phone: string;
  role: string | null;
  projectScope: string;
  status: 'pending' | 'approved' | 'rejected' | 'terminated';
  remark: string | null;
  createdAt: string;
}

const PROJECT_FILTERS: { key: string; label: string; match: string[] | null }[] = [
  { key: 'all', label: '全部项目', match: null },
  { key: 'vivo', label: 'vivo', match: ['vivo'] },
  { key: 'iqoo_douyin', label: 'iQOO抖音', match: ['iqoo_douyin', 'iqoo-douyin', 'iqoo抖音', 'douyin'] },
  { key: 'iqoo_kuaishou', label: 'iQOO快手', match: ['iqoo_kuaishou', 'iqoo-kuaishou', 'iqoo快手', 'kuaishou'] },
  { key: 'iot', label: 'IOT', match: ['iot'] },
];

const ROLE_OPTIONS = ['PM', '运营', '中控', '主播'];

const STATUS_OPTIONS: { value: UserRow['status']; label: string }[] = [
  { value: 'approved', label: '已通过' },
  { value: 'pending', label: '待审批' },
  { value: 'rejected', label: '已拒绝' },
  { value: 'terminated', label: '停止合作' },
];

const PROJECT_OPTIONS = [
  { value: 'vivo', label: 'vivo' },
  { value: 'iqoo_douyin', label: 'iQOO抖音' },
  { value: 'iqoo_kuaishou', label: 'iQOO快手' },
  { value: 'iot', label: 'IOT' },
];

function statusBadge(status: UserRow['status']) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/40">已通过</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border-yellow-500/40">待审批</Badge>;
    case 'rejected':
      return <Badge className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/40">已拒绝</Badge>;
    case 'terminated':
      return <Badge className="bg-zinc-500/20 text-zinc-400 hover:bg-zinc-500/30 border-zinc-500/40">停止合作</Badge>;
  }
}

function projectLabel(brand: string | null): string {
  if (!brand) return '未指定';
  const lower = brand.toLowerCase();
  if (lower.includes('iqoo_douyin') || lower.includes('iqoo-douyin') || lower === 'iqoo抖音' || lower === 'douyin') return 'iQOO抖音';
  if (lower.includes('iqoo_kuaishou') || lower.includes('iqoo-kuaishou') || lower === 'iqoo快手' || lower === 'kuaishou') return 'iQOO快手';
  if (lower.includes('iqoo')) return 'iQOO';
  if (lower.includes('vivo')) return 'vivo';
  if (lower.includes('iot')) return 'IOT';
  return brand;
}

function matchesProject(brand: string, filter: string): boolean {
  if (filter === 'all') return true;
  if (!brand) return false;
  const lower = brand.toLowerCase();
  const cfg = PROJECT_FILTERS.find((p) => p.key === filter);
  if (!cfg || !cfg.match) return true;
  return cfg.match.some((m) => lower.includes(m.toLowerCase()));
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return iso;
  }
}

export default function PersonnelPage() {
  const { currentRole, isClient } = useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [tab, setTab] = useState<'detail' | 'permission'>('detail');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [refreshTick, setRefreshTick] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/users?t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '加载失败');
      setUsers(Array.isArray(data.users) ? data.users : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isClient) return;
    loadUsers();
  }, [isClient, refreshTick, loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => matchesProject(u.projectScope, projectFilter));
  }, [users, projectFilter]);

  const updateUser = useCallback(
    async (id: string, patch: Partial<Pick<UserRow, 'role' | 'projectScope' | 'status'>>) => {
      setSavingIds((prev) => new Set(prev).add(id));
      try {
        const res = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || '更新失败');
        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
      } catch (e) {
        alert(`更新失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  if (!isClient) {
    return (
      <div className="p-8">
        <div className="animate-pulse text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (currentRole !== 'PM') {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground py-8">
              <UsersRound className="mx-auto h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">无访问权限</p>
              <p className="text-sm mt-2">该模块仅项目负责人（PM）可见</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" />
            注册人员管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">统一管理已注册人员的详情与权限</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">项目筛选：</span>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_FILTERS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/50">
          <CardContent className="pt-6 text-red-400 text-sm">加载失败：{error}</CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'detail' | 'permission')}>
        <TabsList>
          <TabsTrigger value="detail">人员详情</TabsTrigger>
          <TabsTrigger value="permission">权限设置</TabsTrigger>
        </TabsList>

        {/* Tab1: 人员详情（只读） */}
        <TabsContent value="detail" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                共 {filteredUsers.length} 位人员
                {projectFilter !== 'all' && (
                  <span className="text-sm text-muted-foreground ml-2">
                    · {PROJECT_FILTERS.find((p) => p.key === projectFilter)?.label}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  加载中...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">当前筛选下无人员数据</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left py-2 px-3 font-medium">姓名</th>
                        <th className="text-left py-2 px-3 font-medium">手机号</th>
                        <th className="text-left py-2 px-3 font-medium">角色</th>
                        <th className="text-left py-2 px-3 font-medium">所属项目</th>
                        <th className="text-left py-2 px-3 font-medium">注册时间</th>
                        <th className="text-left py-2 px-3 font-medium">当前状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr
                          key={u.id}
                          className={`border-b border-border/30 hover:bg-muted/20 transition ${
                            i % 2 === 0 ? '' : 'bg-muted/10'
                          }`}
                        >
                          <td className="py-2 px-3">{u.name || '-'}</td>
                          <td className="py-2 px-3 font-mono text-xs">{u.phone}</td>
                          <td className="py-2 px-3">{u.role || '-'}</td>
                          <td className="py-2 px-3">{projectLabel(u.projectScope)}</td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">
                            {formatDate(u.createdAt)}
                          </td>
                          <td className="py-2 px-3">{statusBadge(u.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab2: 权限设置（可编辑） */}
        <TabsContent value="permission" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                权限设置
                <span className="text-sm text-muted-foreground ml-2 font-normal">
                  修改后自动保存
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  加载中...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">当前筛选下无人员数据</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left py-2 px-3 font-medium">姓名</th>
                        <th className="text-left py-2 px-3 font-medium">手机号</th>
                        <th className="text-left py-2 px-3 font-medium w-32">角色</th>
                        <th className="text-left py-2 px-3 font-medium w-40">所属项目</th>
                        <th className="text-left py-2 px-3 font-medium w-36">状态</th>
                        <th className="text-left py-2 px-3 font-medium w-16">保存</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u, i) => (
                        <tr
                          key={u.id}
                          className={`border-b border-border/30 hover:bg-muted/20 transition ${
                            i % 2 === 0 ? '' : 'bg-muted/10'
                          }`}
                        >
                          <td className="py-2 px-3">{u.name || '-'}</td>
                          <td className="py-2 px-3 font-mono text-xs">{u.phone}</td>
                          <td className="py-2 px-3">
                            <Select
                              value={u.role || ''}
                              onValueChange={(v) => updateUser(u.id, { role: v })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="选择角色" />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-3">
                            <Select
                              value={u.projectScope || ''}
                              onValueChange={(v) => updateUser(u.id, { projectScope: v })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="选择项目" />
                              </SelectTrigger>
                              <SelectContent>
                                {PROJECT_OPTIONS.map((p) => (
                                  <SelectItem key={p.value} value={p.value}>
                                    {p.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-3">
                            <Select
                              value={u.status}
                              onValueChange={(v) => updateUser(u.id, { status: v as UserRow['status'] })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s.value} value={s.value}>
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2 px-3 text-center">
                            {savingIds.has(u.id) ? (
                              <Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" />
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
