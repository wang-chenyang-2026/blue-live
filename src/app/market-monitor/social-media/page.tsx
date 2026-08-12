'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
  Trash2,
  Search,
  Megaphone,
  Lightbulb,
  X,
  Download,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ========== Types ========== */
type TaskType = 'monitor' | 'insight';
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
type BriefStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABORTED';

interface SocialTaskRecord {
  id: string;
  type: TaskType;
  task_name: string;
  project_id?: number | null;
  period?: string | null;
  url_list?: string[];
  brief_session_id?: number | null;
  biz_no?: string | null;
  brief_keyword?: string | null;
  brief_password?: string | null;
  source_codes?: string | null;
  content_modes?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status: TaskStatus;
  mcp_status: number | string | null;
  mcp_status_desc?: string | null;
  result_data?: unknown | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/* ========== Constants ========== */
const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'PT0S', label: '一次性' },
  { value: 'P7D', label: '7 天' },
  { value: 'P15D', label: '15 天' },
  { value: 'P30D', label: '30 天' },
];

const SOURCE_PLATFORMS: { code: string; label: string }[] = [
  { code: '1', label: '小红书' },
  { code: '2', label: '抖音' },
  { code: '3', label: '微博' },
  { code: '4', label: 'B站' },
];

const CONTENT_MODES: { value: string; label: string }[] = [
  { value: 'PGC', label: 'PGC（专业内容）' },
  { value: 'UGC', label: 'UGC（用户内容）' },
  { value: 'ALL', label: '全部' },
];

const STATUS_FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '等待中' },
  { value: 'running', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '异常' },
];

/* ========== Helpers ========== */
function periodLabel(period?: string | null): string {
  if (!period) return '—';
  const found = PERIOD_OPTIONS.find((p) => p.value === period);
  return found ? found.label : period;
}

function sourceCodesToLabels(codes?: string | null): string[] {
  if (!codes) return [];
  return codes
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => SOURCE_PLATFORMS.find((p) => p.code === c)?.label || c);
}

function formatTimestamp(ts?: string | number | null): string {
  if (!ts) return '—';
  const n = typeof ts === 'string' ? Number(ts) : ts;
  if (!Number.isFinite(n)) return String(ts);
  try {
    return new Date(n).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return String(ts);
  }
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return value;
  }
}

function getBriefText(task: SocialTaskRecord): string {
  const rd = task.result_data as { brief?: string; submitResult?: unknown; briefResult?: unknown } | null;
  return rd?.brief || '';
}

async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`请求失败 (HTTP ${res.status})`);
  }
  if (!res.ok || !json.success) {
    throw new Error(json.error || `请求失败 (HTTP ${res.status})`);
  }
  return json.data as T;
}

/* ========== Status Badge ========== */
function StatusBadge({ status, desc }: { status: TaskStatus; desc?: string | null }) {
  const configs: Record<TaskStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending: {
      label: '等待中',
      className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      icon: <Clock className="h-3 w-3" />,
    },
    running: {
      label: '进行中',
      className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <Play className="h-3 w-3" />,
    },
    completed: {
      label: '已完成',
      className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    failed: {
      label: '异常',
      className: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const cfg = configs[status];
  return (
    <Badge variant="outline" className={cn('gap-1', cfg.className)} title={desc || undefined}>
      {status === 'running' && (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
      )}
      {status === 'pending' && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
      )}
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

/* ========== JSON Collapsible Viewer ========== */
function JsonView({ data, name = '数据' }: { data: unknown; name?: string }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);
  return (
    <div className="rounded-md border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {name}
      </button>
      {open && (
        <pre className="max-h-80 overflow-auto px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all">
          {text}
        </pre>
      )}
    </div>
  );
}

/* ========== Info Row ========== */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <div className="w-24 shrink-0 text-muted-foreground">{label}</div>
      <div className="flex-1 text-foreground break-all">{value ?? '—'}</div>
    </div>
  );
}

/* ========== Main Component ========== */
export default function SocialMediaPage() {
  const [activeTab, setActiveTab] = useState<TaskType>('monitor');
  const [tasks, setTasks] = useState<SocialTaskRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Create monitor dialog
  const [monitorDialogOpen, setMonitorDialogOpen] = useState(false);
  const [monitorName, setMonitorName] = useState('');
  const [monitorUrls, setMonitorUrls] = useState<string[]>(['']);
  const [monitorPeriod, setMonitorPeriod] = useState<string>('PT0S');
  const [submittingMonitor, setSubmittingMonitor] = useState(false);

  // Create insight wizard
  const [insightDialogOpen, setInsightDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [insightName, setInsightName] = useState('');
  const [insightBrief, setInsightBrief] = useState('');
  const [submittingBrief, setSubmittingBrief] = useState(false);
  const [currentInsightId, setCurrentInsightId] = useState<string | null>(null);
  const [briefPolling, setBriefPolling] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefKeywords, setBriefKeywords] = useState('');
  const [briefPasswords, setBriefPasswords] = useState('');
  const [insightStartDate, setInsightStartDate] = useState('');
  const [insightEndDate, setInsightEndDate] = useState('');
  const [insightSources, setInsightSources] = useState<string[]>(['2']);
  const [insightContentMode, setInsightContentMode] = useState('ALL');
  const [submittingInsight, setSubmittingInsight] = useState(false);

  // Detail dialog
  const [detailTask, setDetailTask] = useState<SocialTaskRecord | null>(null);

  // Polling refs
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  /* ========== Data loading ========== */
  const loadTasks = useCallback(async (type: TaskType) => {
    setLoading(true);
    try {
      const data = await apiFetch<SocialTaskRecord[]>(
        `/api/market-monitor/social-monitor/tasks?type=${type}`,
      );
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[loadTasks]', err);
      alert(err instanceof Error ? err.message : '加载任务列表失败');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks(activeTab);
  }, [activeTab, loadTasks]);

  /* ========== Polling for running/pending tasks ========== */
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollCountRef.current = 0;

    const activeTasks = tasks.filter(
      (t) => t.status === 'running' || (t.status === 'pending' && t.type === 'insight' && !t.biz_no),
    );

    if (activeTasks.length === 0) return;

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 30) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }

      const updates = await Promise.all(
        activeTasks.map(async (task) => {
          try {
            if (task.type === 'insight' && task.status === 'pending' && !task.biz_no) {
              const data = await apiFetch<{
                status: BriefStatus;
                briefKeyword?: string | null;
                briefPassword?: string | null;
                task: SocialTaskRecord;
              }>(`/api/market-monitor/social-insight/brief-result?taskId=${task.id}`);
              if (data.status === 'COMPLETED' && data.task) {
                return data.task;
              }
              if (data.status === 'FAILED' || data.status === 'ABORTED') {
                return data.task;
              }
              return null;
            }
            // monitor running, or insight running (after biz_no set)
            const updated = await apiFetch<SocialTaskRecord>(
              `/api/market-monitor/social-monitor/task-result?taskId=${task.id}`,
            );
            return updated;
          } catch (err) {
            console.error('[poll task]', err);
            return null;
          }
        }),
      );

      setTasks((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        for (const u of updates) {
          if (u) map.set(u.id, u);
        }
        return Array.from(map.values());
      });

      // Update detail dialog if open
      setDetailTask((prev) => {
        if (!prev) return prev;
        const found = updates.find((u): u is SocialTaskRecord => !!u && u.id === prev.id);
        return found || prev;
      });

      // If no more active tasks, stop polling
      const stillActive = updates.some(
        (u) => u && (u.status === 'running' || (u.status === 'pending' && u.type === 'insight' && !u.biz_no)),
      );
      if (!stillActive) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    }, 10000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tasks]);

  /* ========== Filtering & Stats ========== */
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || t.task_name.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      let matchesPlatform = true;
      if (activeTab === 'insight' && platformFilter !== 'all') {
        const codes = (t.source_codes || '').split(',').map((s) => s.trim());
        matchesPlatform = codes.includes(platformFilter);
      }
      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [tasks, searchQuery, statusFilter, platformFilter, activeTab]);

  const stats = useMemo(() => {
    return {
      total: tasks.length,
      running: tasks.filter((t) => t.status === 'running').length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
  }, [tasks]);

  /* ========== Monitor: create task ========== */
  const resetMonitorForm = () => {
    setMonitorName('');
    setMonitorUrls(['']);
    setMonitorPeriod('PT0S');
  };

  const openMonitorDialog = () => {
    resetMonitorForm();
    setMonitorDialogOpen(true);
  };

  const addUrlField = () => setMonitorUrls((prev) => [...prev, '']);
  const removeUrlField = (idx: number) => {
    setMonitorUrls((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateUrlField = (idx: number, val: string) => {
    setMonitorUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
  };

  const handleCreateMonitor = async () => {
    const name = monitorName.trim();
    if (!name) {
      alert('请输入任务名称');
      return;
    }
    const urls = monitorUrls.map((u) => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      alert('请至少输入一个文章链接');
      return;
    }
    setSubmittingMonitor(true);
    try {
      const record = await apiFetch<SocialTaskRecord>(
        '/api/market-monitor/social-monitor/create-task',
        {
          method: 'POST',
          body: JSON.stringify({
            taskName: name,
            urlList: urls,
            periodDuration: monitorPeriod,
          }),
        },
      );
      setTasks((prev) => [record, ...prev]);
      setMonitorDialogOpen(false);
      resetMonitorForm();
    } catch (err) {
      console.error('[createMonitor]', err);
      alert(err instanceof Error ? err.message : '创建任务失败');
    } finally {
      setSubmittingMonitor(false);
    }
  };

  /* ========== Insight: wizard ========== */
  const resetInsightForm = () => {
    setWizardStep(1);
    setInsightName('');
    setInsightBrief('');
    setCurrentInsightId(null);
    setBriefPolling(false);
    setBriefError(null);
    setBriefKeywords('');
    setBriefPasswords('');
    setInsightStartDate('');
    setInsightEndDate('');
    setInsightSources(['2']);
    setInsightContentMode('ALL');
  };

  const openInsightDialog = () => {
    resetInsightForm();
    setInsightDialogOpen(true);
  };

  // Step 1: submit brief
  const handleSubmitBrief = async () => {
    const name = insightName.trim();
    const brief = insightBrief.trim();
    if (!name) {
      alert('请输入任务名称');
      return;
    }
    if (!brief) {
      alert('请输入洞察目标描述');
      return;
    }
    setSubmittingBrief(true);
    setBriefError(null);
    try {
      const data = await apiFetch<SocialTaskRecord & { briefSessionId?: number }>(
        '/api/market-monitor/social-insight/submit-brief',
        {
          method: 'POST',
          body: JSON.stringify({ taskName: name, brief }),
        },
      );
      setCurrentInsightId(data.id);
      setTasks((prev) => [data, ...prev]);
      setBriefPolling(true);
      // Start polling brief-result
      let count = 0;
      const maxCount = 20;
      const pollBrief = async () => {
        count += 1;
        if (count > maxCount) {
          setBriefPolling(false);
          setBriefError('AI 解析超时，请稍后在列表中重试');
          return;
        }
        try {
          const result = await apiFetch<{
            status: BriefStatus;
            briefKeyword?: string | null;
            briefPassword?: string | null;
            task: SocialTaskRecord;
          }>(`/api/market-monitor/social-insight/brief-result?taskId=${data.id}`);

          // Update the task in list
          setTasks((prev) => prev.map((t) => (t.id === data.id ? result.task : t)));

          if (result.status === 'COMPLETED') {
            setBriefKeywords(result.briefKeyword || '');
            setBriefPasswords(result.briefPassword || '');
            setWizardStep(2);
            setBriefPolling(false);
            if (briefPollRef.current) {
              clearInterval(briefPollRef.current);
              briefPollRef.current = null;
            }
          } else if (result.status === 'FAILED' || result.status === 'ABORTED') {
            setBriefPolling(false);
            setBriefError('AI 解析失败，请调整描述后重试');
            if (briefPollRef.current) {
              clearInterval(briefPollRef.current);
              briefPollRef.current = null;
            }
          }
          // else RUNNING — keep polling
        } catch (err) {
          console.error('[pollBrief]', err);
          // Don't stop on transient errors
        }
      };
      briefPollRef.current = setInterval(pollBrief, 3000);
    } catch (err) {
      console.error('[submitBrief]', err);
      alert(err instanceof Error ? err.message : '提交洞察描述失败');
    } finally {
      setSubmittingBrief(false);
    }
  };

  // Cleanup brief polling on unmount
  useEffect(() => {
    return () => {
      if (briefPollRef.current) {
        clearInterval(briefPollRef.current);
        briefPollRef.current = null;
      }
    };
  }, []);

  const toggleSource = (code: string) => {
    setInsightSources((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  // Step 2: submit collection task
  const handleSubmitInsightTask = async () => {
    if (!currentInsightId) return;
    const kw = briefKeywords.trim();
    if (!kw) {
      alert('关键词不能为空');
      return;
    }
    if (!insightStartDate || !insightEndDate) {
      alert('请选择时间范围');
      return;
    }
    if (insightSources.length === 0) {
      alert('请至少选择一个平台');
      return;
    }
    const startTs = new Date(insightStartDate).getTime();
    const endTs = new Date(insightEndDate).getTime();
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      alert('时间格式无效');
      return;
    }
    if (endTs <= startTs) {
      alert('截止日期必须晚于起始日期');
      return;
    }

    setSubmittingInsight(true);
    try {
      const updated = await apiFetch<SocialTaskRecord>(
        '/api/market-monitor/social-insight/submit-task',
        {
          method: 'POST',
          body: JSON.stringify({
            taskId: currentInsightId,
            startTime: String(startTs),
            endTime: String(endTs),
            sourceCodes: insightSources.sort().join(','),
            contentModes: insightContentMode,
            briefKeyword: kw,
            briefPassword: briefPasswords.trim() || undefined,
          }),
        },
      );
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setInsightDialogOpen(false);
      resetInsightForm();
    } catch (err) {
      console.error('[submitInsightTask]', err);
      alert(err instanceof Error ? err.message : '提交采集任务失败');
    } finally {
      setSubmittingInsight(false);
    }
  };

  /* ========== Delete ========== */
  const handleDelete = async (task: SocialTaskRecord) => {
    if (!window.confirm(`确定要删除任务「${task.task_name}」吗？`)) return;
    try {
      await apiFetch('/api/market-monitor/social-monitor/delete-task', {
        method: 'POST',
        body: JSON.stringify({ taskId: task.id }),
      });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      if (detailTask?.id === task.id) setDetailTask(null);
    } catch (err) {
      console.error('[deleteTask]', err);
      alert(err instanceof Error ? err.message : '删除失败');
    }
  };

  /* ========== Detail dialog title based on type ========== */
  const renderDetailContent = (task: SocialTaskRecord) => {
    if (task.type === 'monitor') {
      return (
        <div className="space-y-3">
          <InfoRow label="任务名称" value={task.task_name} />
          <InfoRow label="任务类型" value="舆情监测" />
          <InfoRow label="监测周期" value={periodLabel(task.period)} />
          <InfoRow
            label="状态"
            value={<StatusBadge status={task.status} desc={task.mcp_status_desc} />}
          />
          <InfoRow label="创建时间" value={formatDate(task.created_at)} />
          <InfoRow label="更新时间" value={formatDate(task.updated_at)} />
          {task.project_id != null && <InfoRow label="项目ID" value={String(task.project_id)} />}
          {task.mcp_status != null && (
            <InfoRow label="MCP状态" value={String(task.mcp_status)} />
          )}

          <div className="pt-2">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              文章链接（{task.url_list?.length || 0}）
            </div>
            <div className="max-h-40 space-y-1.5 overflow-auto rounded-md border border-border p-2">
              {task.url_list && task.url_list.length > 0 ? (
                task.url_list.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block break-all text-xs text-primary hover:underline"
                  >
                    {i + 1}. {url}
                  </a>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">无链接</div>
              )}
            </div>
          </div>

          {task.result_data != null && (
            <div className="pt-1">
              <div className="mb-2 text-xs font-medium text-muted-foreground">监测结果</div>
              <JsonView data={task.result_data} name="result_data" />
            </div>
          )}

          {task.file_url && (
            <div className="pt-2">
              <a href={task.file_url} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-1" />
                  下载监测报告
                </Button>
              </a>
            </div>
          )}
        </div>
      );
    }

    // insight
    const platformLabels = sourceCodesToLabels(task.source_codes);
    return (
      <div className="space-y-3">
        <InfoRow label="任务名称" value={task.task_name} />
        <InfoRow label="任务类型" value="社媒洞察" />
        <InfoRow
          label="状态"
          value={<StatusBadge status={task.status} desc={task.mcp_status_desc} />}
        />
        <InfoRow label="创建时间" value={formatDate(task.created_at)} />
        <InfoRow label="更新时间" value={formatDate(task.updated_at)} />

        {getBriefText(task) && (
          <InfoRow label="洞察目标" value={getBriefText(task)} />
        )}
        {task.brief_keyword && (
          <InfoRow
            label="关键词"
            value={
              <div className="flex flex-wrap gap-1">
                {task.brief_keyword
                  .split(/[,，\s]+/)
                  .filter(Boolean)
                  .map((k, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
              </div>
            }
          />
        )}
        {task.brief_password && (
          <InfoRow
            label="排除词"
            value={
              <div className="flex flex-wrap gap-1">
                {task.brief_password
                  .split(/[,，\s]+/)
                  .filter(Boolean)
                  .map((k, i) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {k}
                    </Badge>
                  ))}
              </div>
            }
          />
        )}
        <InfoRow label="时间范围" value={`${formatTimestamp(task.start_time)} ~ ${formatTimestamp(task.end_time)}`} />
        <InfoRow
          label="平台"
          value={
            platformLabels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {platformLabels.map((p) => (
                  <Badge key={p} variant="secondary" className="text-[10px]">
                    {p}
                  </Badge>
                ))}
              </div>
            ) : (
              '—'
            )
          }
        />
        <InfoRow label="声量类型" value={task.content_modes || '—'} />
        {task.biz_no && <InfoRow label="业务编号" value={task.biz_no} />}
        {task.mcp_status != null && (
          <InfoRow label="采集状态" value={String(task.mcp_status)} />
        )}

        {task.result_data != null && (
          <div className="pt-1">
            <div className="mb-2 text-xs font-medium text-muted-foreground">采集结果</div>
            <JsonView data={task.result_data} name="result_data" />
          </div>
        )}

        {task.file_url && (
          <div className="pt-2">
            <a href={task.file_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline">
                <Download className="h-4 w-4 mr-1" />
                下载分析报告
              </Button>
            </a>
          </div>
        )}
      </div>
    );
  };

  /* ========== Render ========== */
  return (
    <div className="space-y-6">
      {/* Tab Switcher */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TaskType)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="monitor" className="gap-1.5">
            <Megaphone className="h-4 w-4" />
            舆情监测
          </TabsTrigger>
          <TabsTrigger value="insight" className="gap-1.5">
            <Lightbulb className="h-4 w-4" />
            社媒洞察
          </TabsTrigger>
        </TabsList>

        {/* Both tabs share stats/toolbar/table layout */}
        <TabsContent value="monitor" className="space-y-6">
          <StatCards stats={stats} />
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            platformFilter={platformFilter}
            onPlatformFilterChange={setPlatformFilter}
            showPlatformFilter={false}
            onCreateClick={openMonitorDialog}
            createLabel="新建监测任务"
            searchPlaceholder="搜索任务名称..."
          />
          <TaskTable
            tasks={filteredTasks}
            loading={loading}
            type="monitor"
            onView={setDetailTask}
            onDelete={handleDelete}
          />
        </TabsContent>

        <TabsContent value="insight" className="space-y-6">
          <StatCards stats={stats} />
          <Toolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            platformFilter={platformFilter}
            onPlatformFilterChange={setPlatformFilter}
            showPlatformFilter={true}
            onCreateClick={openInsightDialog}
            createLabel="新建洞察任务"
            searchPlaceholder="搜索任务名称..."
          />
          <TaskTable
            tasks={filteredTasks}
            loading={loading}
            type="insight"
            onView={setDetailTask}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

      {/* ========== Create Monitor Dialog ========== */}
      <Dialog open={monitorDialogOpen} onOpenChange={setMonitorDialogOpen}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>新建舆情监测任务</DialogTitle>
            <DialogDescription>
              输入文章链接，系统将自动采集并监测相关舆情数据。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="monitor-name">任务名称</Label>
              <Input
                id="monitor-name"
                placeholder="请输入任务名称"
                value={monitorName}
                onChange={(e) => setMonitorName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>文章链接</Label>
              <div className="space-y-2">
                {monitorUrls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => updateUrlField(idx, e.target.value)}
                    />
                    {monitorUrls.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeUrlField(idx)}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addUrlField}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                添加链接
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monitor-period">监测周期</Label>
              <Select value={monitorPeriod} onValueChange={setMonitorPeriod}>
                <SelectTrigger id="monitor-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMonitorDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateMonitor}
              disabled={submittingMonitor}
              className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
            >
              {submittingMonitor && <Spinner className="mr-1" />}
              创建任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Create Insight Wizard Dialog ========== */}
      <Dialog
        open={insightDialogOpen}
        onOpenChange={(open) => {
          if (!open && briefPollRef.current) {
            clearInterval(briefPollRef.current);
            briefPollRef.current = null;
          }
          setInsightDialogOpen(open);
          if (!open) resetInsightForm();
        }}
      >
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>新建社媒洞察任务</DialogTitle>
            <DialogDescription>
              {wizardStep === 1
                ? '描述你想洞察的目标，AI 将自动解析关键词。'
                : '确认关键词并设置采集范围。'}
            </DialogDescription>
          </DialogHeader>

          {wizardStep === 1 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="insight-name">任务名称</Label>
                <Input
                  id="insight-name"
                  placeholder="请输入任务名称"
                  value={insightName}
                  onChange={(e) => setInsightName(e.target.value)}
                  disabled={briefPolling}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="insight-brief">洞察目标描述</Label>
                <Textarea
                  id="insight-brief"
                  rows={5}
                  placeholder="例如：监测 vivo X200 新品在抖音、小红书上的用户评价和种草内容"
                  value={insightBrief}
                  onChange={(e) => setInsightBrief(e.target.value)}
                  disabled={briefPolling}
                />
                <p className="text-xs text-muted-foreground">
                  用自然语言描述你想要监测的品牌、产品、平台和分析目标。
                </p>
              </div>

              {briefError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {briefError}
                </div>
              )}

              {briefPolling && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  <Spinner />
                  AI 正在解析洞察目标，请稍候...
                </div>
              )}
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="brief-keywords">关键词组</Label>
                <Textarea
                  id="brief-keywords"
                  rows={2}
                  value={briefKeywords}
                  onChange={(e) => setBriefKeywords(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  AI 解析出的关键词，可手动修改。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brief-passwords">排除词（可选）</Label>
                <Textarea
                  id="brief-passwords"
                  rows={2}
                  value={briefPasswords}
                  onChange={(e) => setBriefPasswords(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start-date">起始日期</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={insightStartDate}
                    onChange={(e) => setInsightStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">截止日期</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={insightEndDate}
                    onChange={(e) => setInsightEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>采集平台</Label>
                <div className="flex flex-wrap gap-4">
                  {SOURCE_PLATFORMS.map((p) => (
                    <label
                      key={p.code}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={insightSources.includes(p.code)}
                        onCheckedChange={() => toggleSource(p.code)}
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content-mode">声量类型</Label>
                <Select value={insightContentMode} onValueChange={setInsightContentMode}>
                  <SelectTrigger id="content-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {wizardStep === 1 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setInsightDialogOpen(false)}
                  disabled={submittingBrief || briefPolling}
                >
                  取消
                </Button>
                <Button
                  onClick={handleSubmitBrief}
                  disabled={submittingBrief || briefPolling}
                  className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
                >
                  {(submittingBrief || briefPolling) && <Spinner className="mr-1" />}
                  {briefPolling ? '解析中...' : '提交并解析'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setWizardStep(1)}
                  disabled={submittingInsight}
                >
                  上一步
                </Button>
                <Button
                  onClick={handleSubmitInsightTask}
                  disabled={submittingInsight}
                  className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
                >
                  {submittingInsight && <Spinner className="mr-1" />}
                  开始采集
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== Detail Dialog ========== */}
      <Dialog open={!!detailTask} onOpenChange={(open) => !open && setDetailTask(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>任务详情</DialogTitle>
            <DialogDescription>
              {detailTask?.type === 'monitor' ? '舆情监测任务' : '社媒洞察任务'}
            </DialogDescription>
          </DialogHeader>
          {detailTask && renderDetailContent(detailTask)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTask(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ========== Stat Cards ========== */
function StatCards({
  stats,
}: {
  stats: { total: number; running: number; pending: number; completed: number; failed: number };
}) {
  const displayCards = [
    { label: '总任务数', value: stats.total, color: 'text-foreground' },
    { label: '进行中', value: stats.running, color: 'text-emerald-400' },
    { label: '已完成', value: stats.completed, color: 'text-zinc-400' },
    { label: '异常', value: stats.failed, color: 'text-red-400' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {displayCards.map((c) => (
        <Card key={c.label} className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">{c.label}</div>
            <div className={cn('text-2xl font-bold', c.color)}>{c.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ========== Toolbar ========== */
function Toolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  platformFilter,
  onPlatformFilterChange,
  showPlatformFilter,
  onCreateClick,
  createLabel,
  searchPlaceholder,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  platformFilter: string;
  onPlatformFilterChange: (v: string) => void;
  showPlatformFilter: boolean;
  onCreateClick: () => void;
  createLabel: string;
  searchPlaceholder: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showPlatformFilter && (
            <Select value={platformFilter} onValueChange={onPlatformFilterChange}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {SOURCE_PLATFORMS.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="flex-1" />

          <Button
            onClick={onCreateClick}
            className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
          >
            <Plus className="h-4 w-4 mr-1" />
            {createLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ========== Task Table ========== */
function TaskTable({
  tasks,
  loading,
  type,
  onView,
  onDelete,
}: {
  tasks: SocialTaskRecord[];
  loading: boolean;
  type: TaskType;
  onView: (task: SocialTaskRecord) => void;
  onDelete: (task: SocialTaskRecord) => void;
}) {
  const title = type === 'monitor' ? '舆情监测任务列表' : '社媒洞察任务列表';
  const icon =
    type === 'monitor' ? (
      <Megaphone className="h-4 w-4 text-primary" />
    ) : (
      <Lightbulb className="h-4 w-4 text-primary" />
    );

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-0">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>共 {tasks.length} 个任务</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>任务名称</TableHead>
                {type === 'monitor' ? (
                  <>
                    <TableHead>链接数</TableHead>
                    <TableHead>监测周期</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Brief摘要</TableHead>
                    <TableHead>平台</TableHead>
                  </>
                )}
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && tasks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={type === 'monitor' ? 6 : 6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Spinner className="mx-auto mb-2" />
                    加载中...
                  </TableCell>
                </TableRow>
              )}
              {!loading && tasks.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-12 text-muted-foreground"
                  >
                    暂无任务
                  </TableCell>
                </TableRow>
              )}
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium text-foreground max-w-[240px] truncate">
                    {task.task_name}
                  </TableCell>
                  {type === 'monitor' ? (
                    <>
                      <TableCell className="font-mono tabular-nums">
                        {task.url_list?.length || 0}
                      </TableCell>
                      <TableCell>{periodLabel(task.period)}</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate text-xs text-muted-foreground" title={getBriefText(task)}>
                          {getBriefText(task) || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sourceCodesToLabels(task.source_codes).length > 0 ? (
                            sourceCodesToLabels(task.source_codes).map((p) => (
                              <Badge key={p} variant="secondary" className="text-[10px]">
                                {p}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    <StatusBadge status={task.status} desc={task.mcp_status_desc} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(task.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="查看详情"
                        onClick={() => onView(task)}
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="删除"
                        onClick={() => onDelete(task)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
