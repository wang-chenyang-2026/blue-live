'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarDays, Clock, Users, Moon, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateInfo {
  iso: string;
  display: string;
  weekday: string;
}

interface PersonSegment {
  date: string;
  display: string;
  timeRange: string;
  hours: number;
}

interface PersonSummary {
  name: string;
  totalHours: number;
  lateNightHours: number;
  segments: PersonSegment[];
}

interface AccountSchedule {
  accountName: string;
  dateRange: DateInfo[];
  timeSlots: string[];
  scheduleData: string[][];
  personSummary: PersonSummary[];
}

interface ScheduleData {
  accounts: AccountSchedule[];
  dateCount: number;
  dateRange: DateInfo[];
}

type ViewMode = 'schedule' | 'person';

export default function SchedulePage() {
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ScheduleData | null>(null);
  const [activeAccount, setActiveAccount] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('schedule');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);

  // Initialize dates on client
  useEffect(() => {
    setIsClient(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = now.toISOString().split('T')[0];
    const firstDay = monthStart.toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(today);
  }, []);

  const fetchData = useCallback(async (sd?: string, ed?: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sd) params.set('startDate', sd);
      if (ed) params.set('endDate', ed);
      const res = await fetch(`/api/schedule?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || '获取数据失败');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClient && startDate && endDate) {
      fetchData(startDate, endDate);
    }
  }, [isClient, startDate, endDate, fetchData]);

  // Quick date selectors
  const setThisWeek = () => {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setStartDate(monday.toISOString().split('T')[0]);
    setEndDate(sunday.toISOString().split('T')[0]);
    setWeekOffset(0);
  };

  const setThisMonth = () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    setStartDate(monthStart.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
    setWeekOffset(0);
  };

  const setLastMonth = () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    setStartDate(monthStart.toISOString().split('T')[0]);
    setEndDate(monthEnd.toISOString().split('T')[0]);
    setWeekOffset(0);
  };

  const navigateWeek = (direction: number) => {
    const base = new Date();
    const day = base.getDay() || 7;
    const thisMonday = new Date(base);
    thisMonday.setDate(base.getDate() - day + 1 + direction * 7);
    const sunday = new Date(thisMonday);
    sunday.setDate(thisMonday.getDate() + 6);
    setWeekOffset(direction);
    setStartDate(thisMonday.toISOString().split('T')[0]);
    setEndDate(sunday.toISOString().split('T')[0]);
  };

  const currentAccount = data?.accounts[activeAccount];

  // Color map for persons
  const personColors: Record<string, string> = {};
  const colorPalette = [
    'bg-blue-500/30 text-blue-300',
    'bg-emerald-500/30 text-emerald-300',
    'bg-amber-500/30 text-amber-300',
    'bg-purple-500/30 text-purple-300',
    'bg-rose-500/30 text-rose-300',
    'bg-cyan-500/30 text-cyan-300',
    'bg-orange-500/30 text-orange-300',
    'bg-teal-500/30 text-teal-300',
    'bg-pink-500/30 text-pink-300',
    'bg-indigo-500/30 text-indigo-300',
    'bg-lime-500/30 text-lime-300',
    'bg-fuchsia-500/30 text-fuchsia-300',
  ];
  let colorIndex = 0;
  const getPersonColor = (name: string) => {
    if (!personColors[name]) {
      personColors[name] = colorPalette[colorIndex % colorPalette.length];
      colorIndex++;
    }
    return personColors[name];
  };

  if (!isClient) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-zinc-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">排班管理</h1>
          <p className="text-sm text-zinc-400 mt-1">直播排班数据来自飞书表格，实时同步</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchData(startDate, endDate)}
          disabled={loading}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Date Selector */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-zinc-400" />
              <span className="text-sm text-zinc-400">日期范围：</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={setThisMonth} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 text-xs">
                本月
              </Button>
              <Button variant="outline" size="sm" onClick={setLastMonth} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 text-xs">
                上月
              </Button>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => navigateWeek(-1)} className="text-zinc-400 hover:text-zinc-200 h-8 w-8 p-0">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={setThisWeek} className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 h-8 text-xs">
                  本周
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigateWeek(1)} className="text-zinc-400 hover:text-zinc-200 h-8 w-8 p-0">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-200 h-8 text-xs w-36"
                />
                <span className="text-zinc-500">至</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-200 h-8 text-xs w-36"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="bg-red-950/30 border-red-900/50">
          <CardContent className="pt-4 text-red-400 text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-zinc-500" />
          <span className="ml-3 text-zinc-500">加载排班数据...</span>
        </div>
      )}

      {/* Main Content */}
      {data && data.accounts.length > 0 && (
        <>
          {/* Account Tabs */}
          <Tabs value={String(activeAccount)} onValueChange={(v) => { setActiveAccount(Number(v)); setViewMode('schedule'); }}>
            <TabsList className="bg-zinc-900 border border-zinc-800">
              {data.accounts.map((acc, idx) => (
                <TabsTrigger key={idx} value={String(idx)} className="data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 text-zinc-400">
                  {acc.accountName}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'schedule' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('schedule')}
              className={viewMode === 'schedule' ? 'bg-blue-600 hover:bg-blue-700' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}
            >
              <Clock className="h-4 w-4 mr-1" />
              排班表
            </Button>
            <Button
              variant={viewMode === 'person' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('person')}
              className={viewMode === 'person' ? 'bg-blue-600 hover:bg-blue-700' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'}
            >
              <Users className="h-4 w-4 mr-1" />
              人员汇总
            </Button>
          </div>

          {currentAccount && (
            <>
              {viewMode === 'schedule' ? (
                /* Schedule Grid */
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg text-zinc-100">
                      {currentAccount.accountName} 排班表
                    </CardTitle>
                    <p className="text-xs text-zinc-500">
                      {currentAccount.dateRange[0]?.display} - {currentAccount.dateRange[currentAccount.dateRange.length - 1]?.display}，共 {currentAccount.dateRange.length} 天
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto" style={{ maxHeight: '70vh' }}>
                      <table className="w-full text-xs border-collapse min-w-[800px]">
                        <thead>
                          <tr className="sticky top-0 z-10">
                            <th className="bg-zinc-800 text-zinc-300 font-medium px-2 py-2 text-left border border-zinc-700 sticky left-0 z-20 min-w-[60px]">
                              时段
                            </th>
                            {currentAccount.dateRange.map((d, i) => (
                              <th key={i} className="bg-zinc-800 text-zinc-300 font-medium px-1 py-2 text-center border border-zinc-700 min-w-[50px]">
                                <div>{d.display}</div>
                                <div className="text-zinc-500 font-normal">{d.weekday}</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentAccount.timeSlots.map((slot, rowIdx) => {
                            const isLateNight = rowIdx < 6; // 0-5点
                            const isDaytime = rowIdx >= 8 && rowIdx < 20; // 8-19点
                            return (
                              <tr key={rowIdx} className={isLateNight ? 'bg-indigo-950/20' : isDaytime ? '' : 'bg-zinc-800/30'}>
                                <td className={`px-2 py-1.5 border border-zinc-700 sticky left-0 z-10 font-medium whitespace-nowrap ${
                                  isLateNight ? 'bg-indigo-950/40 text-indigo-300' : 'bg-zinc-800 text-zinc-300'
                                }`}>
                                  {slot}
                                </td>
                                {currentAccount.scheduleData[rowIdx]?.map((person, colIdx) => (
                                  <td key={colIdx} className={`px-1 py-1.5 border border-zinc-700 text-center ${
                                    person ? getPersonColor(person) : 'text-zinc-600'
                                  }`}>
                                    <span className="text-[11px] leading-tight">{person || '-'}</span>
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-950/40 inline-block"></span> 凌晨班 (0-6点)</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-zinc-800/30 inline-block"></span> 晚间班 (20-24点)</span>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* Person Summary */
                <div className="space-y-4">
                  {/* Stats Overview */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <Users className="h-3.5 w-3.5" />
                          <span>排班人数</span>
                        </div>
                        <div className="text-2xl font-bold text-zinc-100">{currentAccount.personSummary.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>总排班时长</span>
                        </div>
                        <div className="text-2xl font-bold text-zinc-100">
                          {currentAccount.personSummary.reduce((s, p) => s + p.totalHours, 0)}h
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <Moon className="h-3.5 w-3.5" />
                          <span>凌晨班总时长</span>
                        </div>
                        <div className="text-2xl font-bold text-indigo-300">
                          {currentAccount.personSummary.reduce((s, p) => s + p.lateNightHours, 0)}h
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="pt-4 pb-3">
                        <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          <span>覆盖天数</span>
                        </div>
                        <div className="text-2xl font-bold text-zinc-100">{currentAccount.dateRange.length}天</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Person Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {currentAccount.personSummary.map((person) => (
                      <Card key={person.name} className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-2 pt-3 px-4">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm text-zinc-100">{person.name}</CardTitle>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getPersonColor(person.name)}`}>
                              {person.totalHours}h
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-3">
                          <div className="flex items-center gap-3 mb-2 text-xs">
                            <span className="text-zinc-400">总时长: <span className="text-zinc-200 font-medium">{person.totalHours}h</span></span>
                            <span className="text-indigo-400">凌晨班: <span className="text-indigo-300 font-medium">{person.lateNightHours}h</span></span>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {person.segments.map((seg, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                                <span className="text-zinc-400">{seg.display}</span>
                                <span className="text-zinc-300">{seg.timeRange}</span>
                                <span className="text-zinc-500">{seg.hours}h</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
