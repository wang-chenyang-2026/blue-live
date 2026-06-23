'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import {
  getAttendanceList,
  getScheduleList,
  getStaffList,
  addAttendanceItem,
  updateAttendanceItem,
  deleteAttendanceItem,
  setAttendanceList,
  getCurrentMonth,
  genId,
} from '@/lib/store';
import type { AttendanceItem, AttendanceStatus, Staff, ScheduleItem } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Download, Plus, Trash2, Edit2, AlertTriangle, CheckCircle, Clock, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; icon: React.ElementType }> = {
  '正常': { label: '正常', color: 'bg-green-500/20 text-green-400', icon: CheckCircle },
  '迟到': { label: '迟到', color: 'bg-yellow-500/20 text-yellow-400', icon: Clock },
  '早退': { label: '早退', color: 'bg-orange-500/20 text-orange-400', icon: Clock },
  '缺勤': { label: '缺勤', color: 'bg-red-500/20 text-red-400', icon: AlertTriangle },
  '请假': { label: '请假', color: 'bg-blue-500/20 text-blue-400', icon: FileSpreadsheet },
};

export default function AttendancePage() {
  const { currentBrand, isClient } = useApp();
  const [attendances, setAttendances] = useState<AttendanceItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [currentMonth, setCurrentMonth] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>(currentBrand === 'all' ? 'all' : currentBrand);
  const [filterType, setFilterType] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AttendanceItem | null>(null);
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [compareStaffId, setCompareStaffId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formStaffId, setFormStaffId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formScheduledStart, setFormScheduledStart] = useState('');
  const [formScheduledEnd, setFormScheduledEnd] = useState('');
  const [formActualStart, setFormActualStart] = useState('');
  const [formActualEnd, setFormActualEnd] = useState('');
  const [formStatus, setFormStatus] = useState<AttendanceStatus>('正常');
  const [formRemark, setFormRemark] = useState('');
  const [formBrandId, setFormBrandId] = useState('');

  useEffect(() => {
    const now = new Date();
    setCurrentMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    setAttendances(getAttendanceList());
    setSchedules(getScheduleList());
    setStaffList(getStaffList());
  }, []);

  useEffect(() => {
    setFilterBrand(currentBrand === 'all' ? 'all' : currentBrand);
  }, [currentBrand]);

  const staffMap = useMemo(() => {
    const map: Record<string, Staff> = {};
    staffList.forEach((s) => { map[s.id] = s; });
    return map;
  }, [staffList]);

  const filteredAttendances = useMemo(() => {
    return attendances.filter((a) => {
      if (!a.date.startsWith(currentMonth)) return false;
      if (filterBrand !== 'all' && a.brandId !== filterBrand) return false;
      if (filterType !== 'all') {
        const staff = staffMap[a.staffId];
        if (!staff) return false;
        if (filterType === '全职' && staff.type !== '全职') return false;
        if (filterType === '兼职' && staff.type !== '兼职') return false;
      }
      return true;
    });
  }, [attendances, currentMonth, filterBrand, filterType, staffMap]);

  // 月度汇总
  const monthlySummary = useMemo(() => {
    const summary: Record<string, { normal: number; late: number; early: number; absent: number; leave: number }> = {};
    const brands = filterBrand === 'all' ? BRANDS : BRANDS.filter((b) => b.id === filterBrand);
    brands.forEach((b) => {
      summary[b.id] = { normal: 0, late: 0, early: 0, absent: 0, leave: 0 };
    });
    filteredAttendances.forEach((a) => {
      if (!summary[a.brandId]) summary[a.brandId] = { normal: 0, late: 0, early: 0, absent: 0, leave: 0 };
      switch (a.status) {
        case '正常': summary[a.brandId].normal++; break;
        case '迟到': summary[a.brandId].late++; break;
        case '早退': summary[a.brandId].early++; break;
        case '缺勤': summary[a.brandId].absent++; break;
        case '请假': summary[a.brandId].leave++; break;
      }
    });
    return summary;
  }, [filteredAttendances, filterBrand]);

  const handleOpenDialog = useCallback((item?: AttendanceItem) => {
    if (item) {
      setEditingItem(item);
      setFormStaffId(item.staffId);
      setFormDate(item.date);
      setFormScheduledStart(item.scheduledStart);
      setFormScheduledEnd(item.scheduledEnd);
      setFormActualStart(item.actualStart || '');
      setFormActualEnd(item.actualEnd || '');
      setFormStatus(item.status);
      setFormRemark(item.remark || '');
      setFormBrandId(item.brandId);
    } else {
      setEditingItem(null);
      setFormStaffId('');
      setFormDate(currentMonth ? `${currentMonth}-01` : '');
      setFormScheduledStart('');
      setFormScheduledEnd('');
      setFormActualStart('');
      setFormActualEnd('');
      setFormStatus('正常');
      setFormRemark('');
      setFormBrandId(currentBrand !== 'all' ? currentBrand : BRANDS[0].id);
    }
    setDialogOpen(true);
  }, [currentMonth, currentBrand]);

  const handleSave = useCallback(() => {
    if (!formStaffId || !formDate || !formScheduledStart || !formScheduledEnd) return;

    if (editingItem) {
      const updated: AttendanceItem = {
        ...editingItem,
        staffId: formStaffId,
        date: formDate,
        scheduledStart: formScheduledStart,
        scheduledEnd: formScheduledEnd,
        actualStart: formActualStart || undefined,
        actualEnd: formActualEnd || undefined,
        status: formStatus,
        remark: formRemark || undefined,
        brandId: formBrandId,
      };
      updateAttendanceItem(updated);
    } else {
      const newItem: AttendanceItem = {
        id: genId(),
        staffId: formStaffId,
        date: formDate,
        scheduledStart: formScheduledStart,
        scheduledEnd: formScheduledEnd,
        actualStart: formActualStart || undefined,
        actualEnd: formActualEnd || undefined,
        status: formStatus,
        remark: formRemark || undefined,
        brandId: formBrandId,
      };
      addAttendanceItem(newItem);
    }
    setAttendances(getAttendanceList());
    setDialogOpen(false);
  }, [editingItem, formStaffId, formDate, formScheduledStart, formScheduledEnd, formActualStart, formActualEnd, formStatus, formRemark, formBrandId]);

  const handleDelete = useCallback((id: string) => {
    deleteAttendanceItem(id);
    setAttendances(getAttendanceList());
  }, []);

  // Excel批量导入
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

      const newItems: AttendanceItem[] = [];
      rows.forEach((row) => {
        // 钉钉导出格式适配：姓名、日期、上班时间、下班时间
        const name = row['姓名'] || row['名字'] || '';
        const date = row['日期'] || row['考勤日期'] || '';
        const clockIn = row['上班打卡时间'] || row['签到时间'] || '';
        const clockOut = row['下班打卡时间'] || row['签退时间'] || '';

        if (!name || !date) return;

        const staff = staffList.find((s) => s.name === name);
        if (!staff) return;

        // 日期格式转换
        let formattedDate = date;
        if (typeof date === 'number') {
          const d = new Date((date - 25569) * 86400 * 1000);
          formattedDate = d.toISOString().split('T')[0];
        }

        // 判断状态
        let status: AttendanceStatus = '正常';
        if (!clockIn && !clockOut) {
          status = '缺勤';
        } else if (clockIn && !clockOut) {
          status = '早退';
        }

        const brandId = staff.brandIds[0] || BRANDS[0].id;

        newItems.push({
          id: genId(),
          staffId: staff.id,
          brandId,
          date: formattedDate,
          scheduledStart: '09:00',
          scheduledEnd: '18:00',
          actualStart: clockIn || undefined,
          actualEnd: clockOut || undefined,
          status,
          remark: '钉钉导入',
        });
      });

      if (newItems.length > 0) {
        const existing = getAttendanceList();
        setAttendanceList([...existing, ...newItems]);
        setAttendances(getAttendanceList());
      }
    } catch (err) {
      console.error('Excel解析失败:', err);
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [staffList]);

  // 导出考勤
  const handleExport = useCallback(() => {
    const header = '姓名,品牌,日期,排班开始,排班结束,实际签到,实际签退,状态,备注\n';
    const rows = filteredAttendances.map((a) => {
      const staff = staffMap[a.staffId];
      const brand = BRANDS.find((b) => b.id === a.brandId);
      return `${staff?.name || ''},${brand?.name || ''},${a.date},${a.scheduledStart},${a.scheduledEnd},${a.actualStart || ''},${a.actualEnd || ''},${a.status},${a.remark || ''}`;
    }).join('\n');

    const csv = '\uFEFF' + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `考勤记录_${currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAttendances, staffMap, currentMonth]);

  // 排班对比
  const compareData = useMemo(() => {
    if (!compareStaffId) return [];
    const staffSchedules = schedules.filter((s) => s.staffId === compareStaffId && s.date.startsWith(currentMonth));
    const staffAttendances = attendances.filter((a) => a.staffId === compareStaffId && a.date.startsWith(currentMonth));

    return staffSchedules.map((sch) => {
      const att = staffAttendances.find((a) => a.date === sch.date);
      return {
        date: sch.date,
        scheduledStart: sch.startTime,
        scheduledEnd: sch.endTime,
        actualStart: att?.actualStart || '-',
        actualEnd: att?.actualEnd || '-',
        status: att?.status || '未打卡',
        accountId: sch.accountId,
      };
    });
  }, [compareStaffId, schedules, attendances, currentMonth]);

  if (!isClient || !currentMonth) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const targetBrands = filterBrand === 'all' ? BRANDS : BRANDS.filter((b) => b.id === filterBrand);
  const filteredStaff = staffList.filter((s) => {
    if (filterBrand !== 'all' && !s.brandIds.includes(filterBrand)) return false;
    if (filterType === '全职' && s.type !== '全职') return false;
    if (filterType === '兼职' && s.type !== '兼职') return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">考勤管理</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentMonth} 月度考勤记录</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> 导入钉钉数据
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" /> 导出
          </Button>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-1" /> 新增考勤
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setCompareStaffId(''); setCompareDialogOpen(true); }}>
            排班对比
          </Button>
        </div>
      </div>

      {/* 筛选器 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">品牌</Label>
          <Select value={filterBrand} onValueChange={setFilterBrand}>
            <SelectTrigger className="w-32 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部品牌</SelectItem>
              {BRANDS.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">人员类型</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-24 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="全职">全职</SelectItem>
              <SelectItem value="兼职">兼职</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 月度汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {targetBrands.map((brand) => {
          const s = monthlySummary[brand.id] || { normal: 0, late: 0, early: 0, absent: 0, leave: 0 };
          const total = s.normal + s.late + s.early + s.absent + s.leave;
          const abnormalRate = total > 0 ? ((s.late + s.early + s.absent) / total * 100).toFixed(1) : '0.0';

          return (
            <Card key={brand.id} className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: brand.color }} />
                  {brand.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-green-400">{s.normal}</p>
                    <p className="text-[10px] text-muted-foreground">正常</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-yellow-400">{s.late}</p>
                    <p className="text-[10px] text-muted-foreground">迟到</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-orange-400">{s.early}</p>
                    <p className="text-[10px] text-muted-foreground">早退</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-400">{s.absent}</p>
                    <p className="text-[10px] text-muted-foreground">缺勤</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-400">{s.leave}</p>
                    <p className="text-[10px] text-muted-foreground">请假</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">异常率</span>
                  <span className={cn('text-sm font-bold', Number(abnormalRate) > 20 ? 'text-red-400' : 'text-green-400')}>
                    {abnormalRate}%
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 考勤明细表 */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base text-foreground">考勤明细</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">姓名</TableHead>
                <TableHead className="text-muted-foreground">品牌</TableHead>
                <TableHead className="text-muted-foreground">类型</TableHead>
                <TableHead className="text-muted-foreground">日期</TableHead>
                <TableHead className="text-muted-foreground">排班时间</TableHead>
                <TableHead className="text-muted-foreground">实际签到</TableHead>
                <TableHead className="text-muted-foreground">实际签退</TableHead>
                <TableHead className="text-muted-foreground">状态</TableHead>
                <TableHead className="text-muted-foreground">备注</TableHead>
                <TableHead className="text-muted-foreground text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttendances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    暂无考勤记录
                  </TableCell>
                </TableRow>
              ) : (
                filteredAttendances.map((a) => {
                  const staff = staffMap[a.staffId];
                  const brand = BRANDS.find((b) => b.id === a.brandId);
                  const statusCfg = STATUS_CONFIG[a.status];

                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium text-foreground">{staff?.name || '-'}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand?.color }} />
                          {brand?.name || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', staff?.type === '全职' ? 'border-blue-500/50 text-blue-400' : 'border-purple-500/50 text-purple-400')}>
                          {staff?.type || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-foreground">{a.date}</TableCell>
                      <TableCell className="text-foreground">{a.scheduledStart}-{a.scheduledEnd}</TableCell>
                      <TableCell className="text-foreground">{a.actualStart || '-'}</TableCell>
                      <TableCell className="text-foreground">{a.actualEnd || '-'}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', statusCfg.color)}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{a.remark || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(a)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新增/编辑考勤对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingItem ? '编辑考勤' : '新增考勤'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">品牌</Label>
                <Select value={formBrandId} onValueChange={setFormBrandId}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANDS.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">人员</Label>
                <Select value={formStaffId} onValueChange={setFormStaffId}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue placeholder="选择人员" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.type}/{s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">日期</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">状态</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as AttendanceStatus)}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">排班开始</Label>
                <Input type="time" value={formScheduledStart} onChange={(e) => setFormScheduledStart(e.target.value)} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">排班结束</Label>
                <Input type="time" value={formScheduledEnd} onChange={(e) => setFormScheduledEnd(e.target.value)} className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">实际签到</Label>
                <Input type="time" value={formActualStart} onChange={(e) => setFormActualStart(e.target.value)} className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">实际签退</Label>
                <Input type="time" value={formActualEnd} onChange={(e) => setFormActualEnd(e.target.value)} className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">备注</Label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="可选备注" className="bg-secondary border-border mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 排班对比对话框 */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">排班与考勤对比</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground text-sm">选择人员</Label>
              <Select value={compareStaffId} onValueChange={setCompareStaffId}>
                <SelectTrigger className="w-48 bg-secondary border-border">
                  <SelectValue placeholder="选择人员" />
                </SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.type}/{s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {compareStaffId && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-muted-foreground">日期</TableHead>
                    <TableHead className="text-muted-foreground">排班时间</TableHead>
                    <TableHead className="text-muted-foreground">实际签到</TableHead>
                    <TableHead className="text-muted-foreground">实际签退</TableHead>
                    <TableHead className="text-muted-foreground">状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compareData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-4">暂无排班记录</TableCell>
                    </TableRow>
                  ) : (
                    compareData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-foreground">{row.date}</TableCell>
                        <TableCell className="text-foreground">{row.scheduledStart}-{row.scheduledEnd}</TableCell>
                        <TableCell className="text-foreground">{row.actualStart}</TableCell>
                        <TableCell className="text-foreground">{row.actualEnd}</TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px]', row.status === '正常' ? 'bg-green-500/20 text-green-400' : row.status === '未打卡' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400')}>
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
