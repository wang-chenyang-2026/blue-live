'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import {
  getFeedbackList,
  addFeedbackItem,
  updateFeedbackItem,
  getStaffList,
  genId,
  getCurrentDate,
} from '@/lib/store';
import type { ProblemFeedback, Staff } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { Plus, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function FeedbackPage() {
  const { currentBrand, isClient } = useApp();
  const [feedbacks, setFeedbacks] = useState<ProblemFeedback[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingItem, setReplyingItem] = useState<ProblemFeedback | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Form state
  const [formAccountId, setFormAccountId] = useState('');
  const [formContent, setFormContent] = useState('');

  useEffect(() => {
    setFeedbacks(getFeedbackList());
    setStaffList(getStaffList());
  }, []);

  const staffMap = useMemo(() => {
    const map: Record<string, Staff> = {};
    staffList.forEach((s) => { map[s.id] = s; });
    return map;
  }, [staffList]);

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((f) => {
      if (currentBrand !== 'all' && f.brandId !== currentBrand) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [feedbacks, currentBrand, filterStatus]);

  // 统计
  const stats = useMemo(() => {
    const pending = filteredFeedbacks.filter((f) => f.status === '待处理').length;
    const resolved = filteredFeedbacks.filter((f) => f.status === '已处理').length;
    return { pending, resolved, total: filteredFeedbacks.length };
  }, [filteredFeedbacks]);

  const handleOpenDialog = useCallback(() => {
    const brandId = currentBrand !== 'all' ? currentBrand : BRANDS[0].id;
    const brand = BRANDS.find((b) => b.id === brandId);
    setFormAccountId(brand?.accounts[0]?.id || '');
    setFormContent('');
    setDialogOpen(true);
  }, [currentBrand]);

  const handleSave = useCallback(() => {
    if (!formContent || !formAccountId) return;

    const brandId = currentBrand !== 'all' ? currentBrand : BRANDS[0].id;
    // 找到当前用户（中控）- 使用staffList中第一个中控
    const currentUser = staffList.find((s) => s.role === '中控');

    addFeedbackItem({
      id: genId(),
      brandId,
      accountId: formAccountId,
      staffId: currentUser?.id || '',
      date: new Date().toISOString().split('T')[0],
      content: formContent,
      status: '待处理',
    });
    setFeedbacks(getFeedbackList());
    setDialogOpen(false);
  }, [formContent, formAccountId, currentBrand, staffList]);

  const handleReply = useCallback((item: ProblemFeedback) => {
    setReplyingItem(item);
    setReplyContent(item.reply || '');
    setReplyDialogOpen(true);
  }, []);

  const handleSaveReply = useCallback(() => {
    if (!replyingItem || !replyContent) return;
    updateFeedbackItem({
      ...replyingItem,
      reply: replyContent,
      status: '已处理',
    });
    setFeedbacks(getFeedbackList());
    setReplyDialogOpen(false);
  }, [replyingItem, replyContent]);

  if (!isClient) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const targetBrand = currentBrand !== 'all' ? BRANDS.find((b) => b.id === currentBrand) : null;
  const accounts = targetBrand ? targetBrand.accounts : BRANDS.flatMap((b) => b.accounts);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">问题反馈</h1>
          <p className="text-sm text-muted-foreground mt-1">跟播问题记录与处理</p>
        </div>
        <Button size="sm" onClick={handleOpenDialog}>
          <Plus className="h-4 w-4 mr-1" /> 提交反馈
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              <p className="text-xs text-muted-foreground">反馈总数</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">待处理</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="py-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">{stats.resolved}</p>
              <p className="text-xs text-muted-foreground">已处理</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">状态</Label>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-28 bg-secondary border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="待处理">待处理</SelectItem>
            <SelectItem value="已处理">已处理</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 反馈列表 */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-muted-foreground">日期</TableHead>
                <TableHead className="text-muted-foreground">账号</TableHead>
                <TableHead className="text-muted-foreground">反馈人</TableHead>
                <TableHead className="text-muted-foreground">内容</TableHead>
                <TableHead className="text-muted-foreground">状态</TableHead>
                <TableHead className="text-muted-foreground">回复</TableHead>
                <TableHead className="text-muted-foreground text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFeedbacks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    暂无反馈记录
                  </TableCell>
                </TableRow>
              ) : (
                filteredFeedbacks.map((f) => {
                  const account = BRANDS.flatMap((b) => b.accounts).find((a) => a.id === f.accountId);
                  const staff = staffMap[f.staffId];
                  const brand = BRANDS.find((b) => b.id === f.brandId);

                  return (
                    <TableRow key={f.id}>
                      <TableCell className="text-foreground text-sm">{f.date}</TableCell>
                      <TableCell className="text-foreground text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand?.color }} />
                          {account?.name || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-foreground text-sm">{staff?.name || '-'}</TableCell>
                      <TableCell className="text-foreground text-sm max-w-xs truncate">{f.content}</TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', f.status === '待处理' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>
                          {f.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-xs truncate">{f.reply || '-'}</TableCell>
                      <TableCell className="text-right">
                        {f.status === '待处理' && (
                          <Button variant="ghost" size="sm" onClick={() => handleReply(f)}>
                            回复
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 提交反馈对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">提交问题反馈</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">直播账号</Label>
              <Select value={formAccountId} onValueChange={setFormAccountId}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue placeholder="选择账号" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">问题描述</Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="详细描述遇到的问题..."
                rows={5}
                className="bg-secondary border-border mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 回复对话框 */}
      <Dialog open={replyDialogOpen} onOpenChange={setReplyDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">处理反馈</DialogTitle>
          </DialogHeader>
          {replyingItem && (
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground text-xs">反馈内容</Label>
                <p className="text-sm text-foreground mt-1 p-3 bg-secondary rounded-lg">{replyingItem.content}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">回复内容</Label>
                <Textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="输入处理结果..."
                  rows={4}
                  className="bg-secondary border-border mt-1"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveReply}>确认处理</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
