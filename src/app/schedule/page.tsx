'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS, HOURLY_RATES, LIVE_TYPES } from '@/lib/constants';
import {
  getScheduleList,
  addScheduleItem,
  updateScheduleItem,
  deleteScheduleItem,
  checkScheduleConflict,
  getStaffList,
  addStaff,
  genId,
  setScheduleList,
  setStaffList,
} from '@/lib/store';
import type { ScheduleItem, Staff, StaffRole, StaffType, LiveType } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Trash2,
  Download,
  AlertCircle,
  CalendarDays,
  UserPlus,
  Edit,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSafeDate } from '@/lib/hooks';

export default function SchedulePage() {
  const { currentBrand, isClient } = useApp();
  const todayStr = useSafeDate();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [staffList, setStaffState] = useState<Staff[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('week');
  // 日期初始值用空字符串，在 useEffect 中用客户端实际日期填充
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [filterBrand, setFilterBrand] = useState<string>('vivo');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showStaffDialog, setShowStaffDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string>('');
  const [newSchedule, setNewSchedule] = useState({
    accountId: '',
    date: '',
    startTime: '09:00',
    endTime: '12:00',
    staffId: '',
    staffRole: '主播' as StaffRole,
    liveType: '日常直播' as LiveType,
    remark: '',
  });
  const [newStaff, setNewStaff] = useState({
    name: '',
    type: '全职' as StaffType,
    role: '主播' as StaffRole,
  });

  const loadData = useCallback(() => {
    setSchedules(getScheduleList());
    setStaffState(getStaffList());
  }, []);

  useEffect(() => {
    // 所有依赖 Date/localStorage 的初始化只在客户端执行
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
    setNewSchedule((prev) => ({ ...prev, date: today }));
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (currentBrand !== 'all') setFilterBrand(currentBrand);
  }, [currentBrand]);

  // 客户端数据未就绪时返回骨架屏，确保 SSR/CSR 结构一致
  if (!isClient || !selectedDate) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">排班管理</h1>
          <p className="text-sm text-muted-foreground mt-1">加载中...</p>
        </div>
        <div className="rounded-xl border border-border bg-card h-96 animate-pulse" />
      </div>
    );
  }

  const brandConfig = BRANDS.find((b) => b.id === filterBrand);
  const accounts = brandConfig?.accounts ?? [];
  const filteredAccounts = filterAccount === 'all' ? accounts : accounts.filter((a) => a.id === filterAccount);

  // 人员按角色过滤
  const anchorStaff = staffList.filter(
    (s) => s.role === '主播' && (s.type === '兼职' || s.brandIds.includes(filterBrand))
  );
  const controlStaff = staffList.filter(
    (s) => s.role === '中控' && (s.type === '兼职' || s.brandIds.includes(filterBrand))
  );

  // 过滤排班数据
  const filteredSchedules = schedules.filter((s) => {
    if (s.brandId !== filterBrand) return false;
    if (filterAccount !== 'all' && s.accountId !== filterAccount) return false;
    return true;
  });

  // 获取周日期范围
  function getWeekDates(dateStr: string): string[] {
    const d = new Date(dateStr);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return Array.from({ length: 7 }, (_, i) => {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      return dd.toISOString().split('T')[0];
    });
  }

  const weekDates = getWeekDates(selectedDate);
  const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  // 添加排班
  function handleAddSchedule() {
    const brandId = filterBrand;
    const account = accounts.find((a) => a.id === newSchedule.accountId);
    if (!account) return;

    // 冲突检测
    const conflicts = checkScheduleConflict(
      newSchedule.staffId,
      newSchedule.date,
      newSchedule.startTime,
      newSchedule.endTime
    );
    if (conflicts.length > 0) {
      const conflictNames = conflicts.map((c) => {
        const acc = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === c.accountId);
        return acc?.name || c.accountId;
      });
      setConflictWarning(`时间冲突：该人员在 ${conflictNames.join('、')} 已有排班`);
      return;
    }

    const item: ScheduleItem = {
      id: genId(),
      accountId: newSchedule.accountId,
      brandId,
      date: newSchedule.date,
      startTime: newSchedule.startTime,
      endTime: newSchedule.endTime,
      staffId: newSchedule.staffId,
      staffRole: newSchedule.staffRole,
      liveType: newSchedule.liveType,
      remark: newSchedule.remark,
    };

    addScheduleItem(item);
    loadData();
    setShowAddDialog(false);
    setConflictWarning('');
    setNewSchedule({
      accountId: accounts[0]?.id || '',
      date: todayStr || new Date().toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '12:00',
      staffId: '',
      staffRole: '主播',
      liveType: '日常直播',
      remark: '',
    });
  }

  // 添加人员
  function handleAddStaff() {
    const item: Staff = {
      id: genId(),
      name: newStaff.name,
      type: newStaff.type,
      role: newStaff.role,
      brandIds: newStaff.type === '兼职' ? [] : [filterBrand],
    };
    addStaff(item);
    loadData();
    setShowStaffDialog(false);
    setNewStaff({ name: '', type: '全职', role: '主播' });
  }

  // 删除排班
  function handleDeleteSchedule(id: string) {
    deleteScheduleItem(id);
    loadData();
  }

  // 导出排班表
  function handleExport() {
    const header = '日期,账号,人员,角色,开始时间,结束时间,直播类型,备注\n';
    const rows = filteredSchedules
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((s) => {
        const staff = staffList.find((st) => st.id === s.staffId);
        const account = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === s.accountId);
        return `${s.date},${account?.name || '-'},${staff?.name || '-'},${s.staffRole},${s.startTime},${s.endTime},${s.liveType},${s.remark || ''}`;
      })
      .join('\n');

    const bom = '\uFEFF';
    const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `排班表_${filterBrand}_${selectedDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const getStaffName = (id: string) => staffList.find((s) => s.id === id)?.name || id;

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">排班管理</h1>
          <p className="text-sm text-muted-foreground mt-1">按账号排主播与中控，支持冲突检测</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>
          <Dialog open={showStaffDialog} onOpenChange={setShowStaffDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <UserPlus className="h-4 w-4 mr-1" />
                添加人员
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>添加人员</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">姓名</Label>
                  <Input
                    value={newStaff.name}
                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                    placeholder="输入人员姓名"
                    className="bg-secondary border-border mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">人员类型</Label>
                    <Select
                      value={newStaff.type}
                      onValueChange={(v) => setNewStaff({ ...newStaff, type: v as StaffType })}
                    >
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="全职">全职</SelectItem>
                        <SelectItem value="兼职">兼职</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">岗位角色</Label>
                    <Select
                      value={newStaff.role}
                      onValueChange={(v) => setNewStaff({ ...newStaff, role: v as StaffRole })}
                    >
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="主播">主播</SelectItem>
                        <SelectItem value="中控">中控</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={handleAddStaff} className="w-full" disabled={!newStaff.name}>
                  确认添加
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); setConflictWarning(''); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                添加排班
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>添加排班</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {conflictWarning && (
                  <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {conflictWarning}
                  </div>
                )}
                <div>
                  <Label className="text-xs text-muted-foreground">账号</Label>
                  <Select
                    value={newSchedule.accountId}
                    onValueChange={(v) => setNewSchedule({ ...newSchedule, accountId: v })}
                  >
                    <SelectTrigger className="bg-secondary border-border mt-1">
                      <SelectValue placeholder="选择账号" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">日期</Label>
                    <Input
                      type="date"
                      value={newSchedule.date}
                      onChange={(e) => setNewSchedule({ ...newSchedule, date: e.target.value })}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">直播类型</Label>
                    <Select
                      value={newSchedule.liveType}
                      onValueChange={(v) => setNewSchedule({ ...newSchedule, liveType: v as LiveType })}
                    >
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {LIVE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t} (¥{HOURLY_RATES[t]}/h)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">开始时间</Label>
                    <Input
                      type="time"
                      value={newSchedule.startTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, startTime: e.target.value })}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">结束时间</Label>
                    <Input
                      type="time"
                      value={newSchedule.endTime}
                      onChange={(e) => setNewSchedule({ ...newSchedule, endTime: e.target.value })}
                      className="bg-secondary border-border mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">岗位</Label>
                    <Select
                      value={newSchedule.staffRole}
                      onValueChange={(v) => {
                        setNewSchedule({ ...newSchedule, staffRole: v as StaffRole, staffId: '' });
                      }}
                    >
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="主播">主播</SelectItem>
                        <SelectItem value="中控">中控</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">人员</Label>
                    <Select
                      value={newSchedule.staffId}
                      onValueChange={(v) => setNewSchedule({ ...newSchedule, staffId: v })}
                    >
                      <SelectTrigger className="bg-secondary border-border mt-1">
                        <SelectValue placeholder="选择人员" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {(newSchedule.staffRole === '主播' ? anchorStaff : controlStaff).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            <span className="text-muted-foreground ml-1">({s.type})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">备注</Label>
                  <Input
                    value={newSchedule.remark}
                    onChange={(e) => setNewSchedule({ ...newSchedule, remark: e.target.value })}
                    placeholder="可选备注"
                    className="bg-secondary border-border mt-1"
                  />
                </div>
                <Button onClick={handleAddSchedule} className="w-full" disabled={!newSchedule.accountId || !newSchedule.staffId}>
                  确认添加
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">品牌：</span>
          {BRANDS.map((b) => (
            <button
              key={b.id}
              onClick={() => { setFilterBrand(b.id); setFilterAccount('all'); }}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                filterBrand === b.id
                  ? 'font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              style={
                filterBrand === b.id
                  ? { backgroundColor: brandColors[b.id] + '25', color: brandColors[b.id] }
                  : undefined
              }
            >
              {b.name}
            </button>
          ))}
        </div>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">账号：</span>
          <Select value={filterAccount} onValueChange={setFilterAccount}>
            <SelectTrigger className="h-7 w-40 bg-secondary border-border text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">全部账号</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Separator orientation="vertical" className="h-5" />
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'day' | 'week')}>
          <TabsList className="h-7">
            <TabsTrigger value="day" className="text-xs px-3">日视图</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-3">周视图</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-7 w-36 bg-secondary border-border text-xs"
          />
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table Header */}
        <div className="grid bg-secondary/50 border-b border-border" style={{
          gridTemplateColumns: viewMode === 'week' ? '120px repeat(7, 1fr)' : '120px 1fr'
        }}>
          <div className="p-3 text-xs font-medium text-muted-foreground border-r border-border">
            账号/时段
          </div>
          {viewMode === 'week' ? (
            weekDates.map((date, i) => {
              const isToday = date === todayStr;
              return (
                <div
                  key={date}
                  className={cn(
                    'p-2 text-center border-r border-border last:border-r-0',
                    isToday && 'bg-primary/10'
                  )}
                >
                  <p className="text-xs text-muted-foreground">{dayNames[i]}</p>
                  <p className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-foreground')}>
                    {date.slice(5)}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="p-3 text-xs font-medium text-muted-foreground">
              {selectedDate}
            </div>
          )}
        </div>

        {/* Account Rows */}
        {filteredAccounts.map((account) => {
          const dates = viewMode === 'week' ? weekDates : [selectedDate];

          return (
            <div key={account.id} className="border-b border-border last:border-b-0">
              <div className="grid min-h-[80px]" style={{
                gridTemplateColumns: viewMode === 'week' ? '120px repeat(7, 1fr)' : '120px 1fr'
              }}>
                {/* Account name */}
                <div className="flex items-center justify-center border-r border-border p-2">
                  <span className="text-xs font-medium text-foreground text-center">{account.name}</span>
                </div>

                {/* Date cells */}
                {dates.map((date) => {
                  const daySchedules = filteredSchedules.filter(
                    (s) => s.accountId === account.id && s.date === date
                  );
                  const anchors = daySchedules.filter((s) => s.staffRole === '主播');
                  const controls = daySchedules.filter((s) => s.staffRole === '中控');

                  return (
                    <div
                      key={date}
                      className="border-r border-border last:border-r-0 p-1.5 space-y-1"
                    >
                      {daySchedules.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground/50 text-center pt-2">无排班</p>
                      ) : (
                        <>
                          {anchors.length > 0 && (
                            <div className="space-y-0.5">
                              {anchors.map((s) => (
                                <div
                                  key={s.id}
                                  className="group relative rounded bg-primary/15 px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-primary/25 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-primary font-medium truncate">
                                      {getStaffName(s.staffId)}
                                    </span>
                                    <button
                                      onClick={() => handleDeleteSchedule(s.id)}
                                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-1 shrink-0"
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                  <p className="text-muted-foreground">
                                    {s.startTime}-{s.endTime}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          {controls.length > 0 && (
                            <div className="space-y-0.5">
                              {controls.map((s) => (
                                <div
                                  key={s.id}
                                  className="group relative rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] cursor-pointer hover:bg-amber-500/25 transition-colors"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-amber-400 font-medium truncate">
                                      {getStaffName(s.staffId)}
                                    </span>
                                    <button
                                      onClick={() => handleDeleteSchedule(s.id)}
                                      className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 ml-1 shrink-0"
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                  <p className="text-muted-foreground">
                                    {s.startTime}-{s.endTime}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Staff List */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium text-foreground mb-3">人员列表</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {staffList
            .filter((s) => s.type === '兼职' || s.brandIds.includes(filterBrand))
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg bg-secondary p-2.5">
                <div
                  className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                    s.role === '主播' ? 'bg-primary/20 text-primary' : 'bg-amber-500/20 text-amber-400'
                  )}
                >
                  {s.name[0]}
                </div>
                <div>
                  <p className="text-xs font-medium text-foreground">{s.name}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-border">
                      {s.type}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] h-4 px-1 border-border">
                      {s.role}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
