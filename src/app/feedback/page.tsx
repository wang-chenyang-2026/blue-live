'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useApp } from '@/contexts/AppContext';
import { MODULE_LABELS, getAccessibleModules, SUPER_ADMIN_PHONE } from '@/lib/constants';
import type { ModuleKey, ProblemFeedback, FeedbackAttachment } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Plus, MessageSquare, CheckCircle, Clock, Paperclip, X, Loader2, FileText, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const FEEDBACK_CATEGORIES = ['新增功能需求', '现有功能维护', '使用反馈'] as const;

const CATEGORY_STYLES: Record<string, string> = {
  新增功能需求: 'bg-blue-500/20 text-blue-400',
  现有功能维护: 'bg-purple-500/20 text-purple-400',
  使用反馈: 'bg-cyan-500/20 text-cyan-400',
};

function attachmentUrl(a: FeedbackAttachment) {
  return `/api/feedback/attachment/${a.fileToken}?name=${encodeURIComponent(a.name)}`;
}

function isImage(a: FeedbackAttachment) {
  return a.type.startsWith('image/');
}

/** 附件列表展示（列表行/弹窗共用） */
function AttachmentList({ attachments, compact }: { attachments?: FeedbackAttachment[]; compact?: boolean }) {
  if (!attachments || attachments.length === 0) return <span className="text-muted-foreground text-xs">-</span>;
  return (
    <div className={cn('flex flex-wrap gap-2', compact && 'max-w-[220px]')}>
      {attachments.map((a) => (
        <a
          key={a.fileToken}
          href={attachmentUrl(a)}
          target="_blank"
          rel="noreferrer"
          title={`${a.name}（点击下载/查看）`}
          className="group relative block"
        >
          {isImage(a) ? (
            <img
              src={attachmentUrl(a)}
              alt={a.name}
              className={cn(
                'rounded-md border border-border object-cover hover:border-blue-400 transition-colors',
                compact ? 'h-10 w-10' : 'h-16 w-16',
              )}
            />
          ) : (
            <span className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-xs text-foreground hover:border-blue-400">
              <FileText className="h-3.5 w-3.5" />
              {compact ? a.name.slice(0, 8) : a.name.slice(0, 16)}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const { isClient, currentUser } = useApp();
  const [feedbacks, setFeedbacks] = useState<ProblemFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [replyingItem, setReplyingItem] = useState<ProblemFeedback | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // 表单状态
  const [formModule, setFormModule] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState<FeedbackAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = currentUser?.phone === SUPER_ADMIN_PHONE;

  /** 当前用户权限内可反馈的模块 */
  const moduleOptions = useMemo(() => {
    const keys = getAccessibleModules(currentUser?.role, currentUser?.phone) as ModuleKey[];
    return keys
      .filter((k) => k !== 'approval' || isSuperAdmin) // approval 仅超管（getAccessibleModules 已处理，双保险）
      .map((k) => ({ key: k, label: MODULE_LABELS[k] }));
  }, [currentUser, isSuperAdmin]);

  const loadFeedbacks = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/feedback', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '加载失败');
      setFeedbacks(data.feedbacks || []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClient) loadFeedbacks();
  }, [isClient, loadFeedbacks]);

  const filteredFeedbacks = useMemo(() => {
    return feedbacks
      .filter((f) => filterStatus === 'all' || f.status === filterStatus)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [feedbacks, filterStatus]);

  const stats = useMemo(() => {
    const pending = filteredFeedbacks.filter((f) => f.status === '待处理').length;
    const resolved = filteredFeedbacks.filter((f) => f.status === '已处理').length;
    return { pending, resolved, total: filteredFeedbacks.length };
  }, [filteredFeedbacks]);

  const handleOpenDialog = useCallback(() => {
    setFormModule(moduleOptions[0]?.label || '');
    setFormCategory(FEEDBACK_CATEGORIES[0]);
    setFormContent('');
    setFormFiles([]);
    setUploadedAttachments([]);
    setSubmitError('');
    setDialogOpen(true);
  }, [moduleOptions]);

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length === 0) return;
    const valid: File[] = [];
    for (const f of picked) {
      const isImg = f.type.startsWith('image/');
      const isVid = f.type.startsWith('video/');
      if (!isImg && !isVid) {
        setSubmitError(`「${f.name}」不是图片或视频，已忽略`);
        continue;
      }
      const limit = isImg ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
      if (f.size > limit) {
        setSubmitError(`「${f.name}」超过${isImg ? '10MB' : '100MB'}上限，已忽略`);
        continue;
      }
      valid.push(f);
    }
    setFormFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFormFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formModule || !formCategory || !formContent.trim()) {
      setSubmitError('请填写模块、反馈类别和问题描述');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      // 1) 先上传附件
      let attachments = uploadedAttachments;
      if (formFiles.length > 0) {
        setUploading(true);
        const uploaded: FeedbackAttachment[] = [];
        for (const f of formFiles) {
          const fd = new FormData();
          fd.append('file', f);
          const res = await fetch('/api/feedback/upload', { method: 'POST', body: fd, credentials: 'include' });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(`附件「${f.name}」上传失败：${data.error || res.status}`);
          uploaded.push({ fileToken: data.fileToken, name: data.name, size: data.size, type: data.type });
        }
        attachments = [...attachments, ...uploaded];
        setUploading(false);
      }
      // 2) 提交反馈
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          module: formModule,
          category: formCategory,
          content: formContent.trim(),
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '提交失败');

      setDialogOpen(false);
      await loadFeedbacks();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setUploading(false);
    } finally {
      setSubmitting(false);
    }
  }, [formModule, formCategory, formContent, formFiles, uploadedAttachments, loadFeedbacks]);

  const handleReply = useCallback((item: ProblemFeedback) => {
    setReplyingItem(item);
    setReplyContent(item.reply || '');
    setReplyDialogOpen(true);
  }, []);

  const handleSaveReply = useCallback(async () => {
    if (!replyingItem || !replyContent.trim()) return;
    try {
      const res = await fetch('/api/feedback/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: replyingItem.id, reply: replyContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '回复失败');
      setReplyDialogOpen(false);
      await loadFeedbacks();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  }, [replyingItem, replyContent, loadFeedbacks]);

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
              <p className="text-xs text-muted-foreground">{isSuperAdmin ? '反馈总数' : '我的反馈'}</p>
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
                <TableHead className="text-muted-foreground">模块</TableHead>
                <TableHead className="text-muted-foreground">反馈类别</TableHead>
                <TableHead className="text-muted-foreground">反馈人</TableHead>
                <TableHead className="text-muted-foreground">内容</TableHead>
                <TableHead className="text-muted-foreground">附件</TableHead>
                <TableHead className="text-muted-foreground">状态</TableHead>
                <TableHead className="text-muted-foreground">回复</TableHead>
                <TableHead className="text-muted-foreground text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : loadError ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-red-400 text-sm py-8">
                    加载失败：{loadError}
                  </TableCell>
                </TableRow>
              ) : filteredFeedbacks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    暂无反馈记录
                  </TableCell>
                </TableRow>
              ) : (
                filteredFeedbacks.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="text-foreground text-sm whitespace-nowrap">{f.date}</TableCell>
                    <TableCell className="text-foreground text-sm whitespace-nowrap">{f.module || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {f.category ? (
                        <Badge className={cn('text-[10px]', CATEGORY_STYLES[f.category] || 'bg-secondary text-muted-foreground')}>
                          {f.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-foreground text-sm whitespace-nowrap">{f.submitterName || f.staffId || '-'}</TableCell>
                    <TableCell className="text-foreground text-sm max-w-[240px]">
                      <span className="line-clamp-2" title={f.content}>{f.content}</span>
                    </TableCell>
                    <TableCell><AttachmentList attachments={f.attachments} compact /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge className={cn('text-[10px]', f.status === '待处理' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400')}>
                        {f.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs max-w-[200px]">
                      <span className="line-clamp-2" title={f.reply}>{f.reply || '-'}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {isSuperAdmin && f.status === '待处理' && (
                        <Button variant="ghost" size="sm" onClick={() => handleReply(f)}>
                          回复
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
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
              <Label className="text-muted-foreground text-xs">所属模块 <span className="text-red-400">*</span></Label>
              <Select value={formModule} onValueChange={setFormModule}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue placeholder="选择模块" />
                </SelectTrigger>
                <SelectContent>
                  {moduleOptions.map((m) => (
                    <SelectItem key={m.key} value={m.label}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">反馈类别 <span className="text-red-400">*</span></Label>
              <Select value={formCategory} onValueChange={setFormCategory}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue placeholder="选择反馈类别" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">问题描述 <span className="text-red-400">*</span></Label>
              <Textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="详细描述遇到的问题..."
                rows={4}
                className="bg-secondary border-border mt-1"
              />
            </div>
            {/* 附件上传 */}
            <div>
              <Label className="text-muted-foreground text-xs">图片/视频附件（可选，支持截图或录屏，图片≤10MB、视频≤100MB）</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleFilePick}
              />
              <div className="mt-1.5 space-y-2">
                {formFiles.length > 0 && (
                  <div className="space-y-1.5">
                    {formFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-foreground">{f.name}</span>
                        <span className="text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)}KB</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="text-muted-foreground hover:text-red-400 shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || submitting}
                >
                  <Paperclip className="h-4 w-4 mr-1" /> 添加截图/视频附件
                </Button>
              </div>
            </div>
            {submitError && <p className="text-xs text-red-400">{submitError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={handleSave} disabled={submitting || uploading}>
              {uploading ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 上传附件中...</>
              ) : submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 提交中...</>
              ) : '提交'}
            </Button>
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
              <div className="rounded-lg border border-border bg-secondary p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge className={cn('text-[10px]', CATEGORY_STYLES[replyingItem.category] || 'bg-secondary text-muted-foreground')}>
                    {replyingItem.category || '-'}
                  </Badge>
                  <span>模块：{replyingItem.module || '-'}</span>
                  <span>反馈人：{replyingItem.submitterName || replyingItem.staffId}</span>
                </div>
                <p className="text-sm text-foreground">{replyingItem.content}</p>
                {replyingItem.attachments && replyingItem.attachments.length > 0 && (
                  <div className="pt-1">
                    <AttachmentList attachments={replyingItem.attachments} />
                  </div>
                )}
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
