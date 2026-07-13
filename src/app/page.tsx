'use client';

import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import {
  getScheduleList,
  getAttendanceList,
  getStaffList,
  calcProfitRate,
  calcProfitRateByAccount,
} from '@/lib/store';
import type { ScheduleItem, AttendanceItem, Staff } from '@/lib/types';
import {
  TrendingUp,
  TrendingDown,
  CalendarDays,
  AlertTriangle,
  Users,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostOverview } from '@/components/CostOverview';

interface ProfitCardData {
  id: string;
  name: string;
  color: string;
  profitRate: number;
  revenue: number;
  totalCost: number;
  kpiDeducted: boolean;
  isSummary?: boolean;
}

export default function DashboardPage() {
  const { currentBrand, isClient } = useApp();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [attendances, setAttendances] = useState<AttendanceItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [currentMonth, setCurrentMonth] = useState<string>('');
  const [weekStartStr, setWeekStartStr] = useState<string>('');
  const [weekEndStr, setWeekEndStr] = useState<string>('');

  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    setCurrentMonth(month);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    setWeekStartStr(weekStart.toISOString().split('T')[0]);
    setWeekEndStr(weekEnd.toISOString().split('T')[0]);

    setSchedules(getScheduleList());
    setAttendances(getAttendanceList());
    setStaffList(getStaffList());
  }, []);

  const brandColors: Record<string, string> = {
    vivo: '#415FFF',
    iqoo: '#FF6B35',
    iot: '#00C9A7',
  };

  // 构建利润卡片数据 - 必须在early return之前调用hooks
  const profitCards: ProfitCardData[] = useMemo(() => {
    if (!currentMonth) return [];

    const cards: ProfitCardData[] = [];

    if (currentBrand === 'all') {
      BRANDS.forEach((brand) => {
        const data = calcProfitRate(brand.id, currentMonth);
        cards.push({
          id: brand.id,
          name: `${brand.name}汇总`,
          color: brandColors[brand.id] || '#888',
          ...data,
        });
      });
    } else {
      const brand = BRANDS.find((b) => b.id === currentBrand);
      if (brand) {
        const brandData = calcProfitRate(brand.id, currentMonth);
        cards.push({
          id: brand.id,
          name: `${brand.name}汇总`,
          color: brandColors[brand.id] || '#888',
          ...brandData,
          isSummary: true,
        });

        brand.accounts.forEach((account) => {
          const accountData = calcProfitRateByAccount(brand.id, account.id, currentMonth);
          cards.push({
            id: account.id,
            name: account.name,
            color: brandColors[brand.id] || '#888',
            ...accountData,
          });
        });
      }
    }

    return cards;
  }, [currentBrand, currentMonth]);

  if (!isClient || !currentMonth) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">首页概览</h1>
          <p className="text-sm text-muted-foreground mt-1">加载中...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // 根据品牌筛选排班/考勤
  const filterByBrand = <T extends { brandId?: string }>(items: T[]): T[] => {
    if (currentBrand === 'all') return items;
    return items.filter((item) => item.brandId === currentBrand);
  };

  // 本周排班概况
  const weekSchedules = filterByBrand(
    schedules.filter((s) => s.date >= weekStartStr && s.date <= weekEndStr)
  );

  // 考勤异常
  const abnormalAttendances = filterByBrand(
    attendances.filter((a) => a.date.startsWith(currentMonth) && a.status !== '正常')
  );

  // 成本预警（所有可见卡片中成本超收入50%的）
  const costWarnings = profitCards.filter((d) => d.revenue > 0 && d.totalCost > d.revenue * 0.5);

  // 网格列数：汇总3列，单品牌根据卡片数量自适应
  const gridCols = currentBrand === 'all'
    ? 'grid-cols-1 md:grid-cols-3'
    : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">首页概览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {currentMonth} 月度数据总览
          {currentBrand !== 'all' && (
            <span className="ml-2">
              · {BRANDS.find((b) => b.id === currentBrand)?.name}
            </span>
          )}
        </p>
      </div>

      {/* 利润率卡片 */}
      <div className={`grid ${gridCols} gap-4`}>
        {profitCards.map((card) => (
          <ProfitCard key={card.id} data={card} />
        ))}
      </div>

      {/* 下方三栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 本周排班概况 */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium text-foreground">本周排班概况</h2>
          </div>
          <div className="space-y-2">
            {weekSchedules.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">暂无排班数据</p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">排班总条数</span>
                  <span className="font-medium text-foreground">{weekSchedules.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">涉及主播</span>
                  <span className="font-medium text-foreground">
                    {new Set(weekSchedules.filter((s) => s.staffRole === '主播').map((s) => s.staffId)).size}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">涉及中控</span>
                  <span className="font-medium text-foreground">
                    {new Set(weekSchedules.filter((s) => s.staffRole === '中控').map((s) => s.staffId)).size}
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {weekSchedules.slice(0, 5).map((s) => {
                    const staff = staffList.find((st) => st.id === s.staffId);
                    const account = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === s.accountId);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-md bg-secondary/50 px-2 py-1.5 text-[11px]"
                      >
                        <span className="text-muted-foreground">{s.date}</span>
                        <span className="text-foreground truncate mx-1">
                          {account?.name || '-'}
                        </span>
                        <span className="text-muted-foreground">
                          {staff?.name || '-'} ({s.staffRole})
                        </span>
                      </div>
                    );
                  })}
                  {weekSchedules.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center">
                      还有 {weekSchedules.length - 5} 条排班...
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 考勤异常提醒 */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-medium text-foreground">考勤异常提醒</h2>
          </div>
          <div className="space-y-2">
            {abnormalAttendances.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">本月无考勤异常</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {(['迟到', '早退', '缺勤'] as const).map((status) => {
                    const count = abnormalAttendances.filter((a) => a.status === status).length;
                    return (
                      <div key={status} className="rounded-md bg-secondary p-2 text-center">
                        <p className="text-lg font-bold text-foreground">{count}</p>
                        <p className="text-[10px] text-muted-foreground">{status}</p>
                      </div>
                    );
                  })}
                </div>
                {abnormalAttendances.slice(0, 4).map((a) => {
                  const staff = staffList.find((s) => s.id === a.staffId);
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-md bg-secondary/50 px-2 py-1.5 text-[11px]"
                    >
                      <span className="text-foreground">{staff?.name || '-'}</span>
                      <span className="text-muted-foreground">{a.date}</span>
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px]',
                          a.status === '缺勤'
                            ? 'bg-destructive/20 text-destructive'
                            : 'bg-amber-500/20 text-amber-400'
                        )}
                      >
                        {a.status}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* 成本预警 */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-medium text-foreground">成本预警</h2>
          </div>
          <div className="space-y-2">
            {costWarnings.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
                  <TrendingUp className="h-5 w-5 text-emerald-400" />
                </div>
                <p className="text-xs text-muted-foreground">各品牌成本状况良好</p>
              </div>
            ) : (
              costWarnings.map((item) => {
                const ratio = item.revenue > 0 ? ((item.totalCost / item.revenue) * 100).toFixed(0) : '--';
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">
                        成本占比 {ratio}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      成本 ¥{item.totalCost.toLocaleString()} / 收入 ¥{item.revenue.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-destructive mt-1">
                      成本超过收入50%，请关注控制
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* 人员统计 */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-medium text-foreground">人员统计</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-secondary p-2 text-center">
                <p className="text-lg font-bold text-foreground">
                  {staffList.filter((s) => s.type === '全职').length}
                </p>
                <p className="text-[10px] text-muted-foreground">全职人员</p>
              </div>
              <div className="rounded-md bg-secondary p-2 text-center">
                <p className="text-lg font-bold text-foreground">
                  {staffList.filter((s) => s.type === '兼职').length}
                </p>
                <p className="text-[10px] text-muted-foreground">兼职人员</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 成本概览模块 */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-foreground mb-4">成本概览</h2>
        <CostOverview />
      </div>
    </div>
  );
}

// 利润卡片组件
function ProfitCard({ data }: { data: ProfitCardData }) {
  const rate = (data.profitRate * 100).toFixed(1);
  const isPositive = data.profitRate >= 0;

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 transition-all hover:scale-[1.01]',
        !data.isSummary && 'border-l-2'
      )}
      style={!data.isSummary ? { borderLeftColor: data.color } : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-3 w-3 rounded-full', data.isSummary && 'h-2.5 w-2.5')}
            style={{ backgroundColor: data.color }}
          />
          <span className={cn('text-sm font-medium text-foreground', data.isSummary && 'font-semibold')}>
            {data.name}
          </span>
        </div>
        {data.kpiDeducted && (
          <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">
            KPI扣减5%
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">利润率</p>
            <p
              className={cn(
                'font-bold',
                data.isSummary ? 'text-3xl' : 'text-2xl',
                isPositive ? 'text-emerald-400' : 'text-destructive'
              )}
            >
              {rate}%
            </p>
          </div>
          {isPositive ? (
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          ) : (
            <TrendingDown className="h-5 w-5 text-destructive" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">服务费收入</p>
            <p className="font-medium text-foreground">
              ¥{data.revenue.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-secondary p-2">
            <p className="text-muted-foreground">总成本</p>
            <p className="font-medium text-foreground">
              ¥{data.totalCost.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
