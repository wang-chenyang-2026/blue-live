'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Users,
  Target,
  Filter,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  ExternalLink,
  FileDown,
  AlertCircle,
  ListChecks,
  PlusCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ========== Types ========== */
type StepKey = 'brief' | 'keywords' | 'filters';
type MainTab = 'new' | 'tasks';

interface PriceRange {
  lower1: number;
  upper1: number;
  lower20: number;
  upper20: number;
  lower60: number;
  upper60: number;
}

interface BriefForm {
  brand: string;
  product: string;
  targetAudience: string;
  contentDirection: string;
  background: string;
  liveType: string;
  budget: string;
  influencerType: string;
  platform: string;
  priceRanges: PriceRange;
}

interface MCPKeywordGroup {
  content: string;
  query: string;
  pass_word: string[];
  selected: boolean;
}

interface FilterForm {
  minFollowers: number; // 万
  maxFollowers: number; // 万
  minEngagement: number; // 百分比
  minPlayAvg: number;
  kolNumLower: number;
}

interface TaskItem {
  id: string;
  projectId: number;
  taskName: string;
  productName: string;
  brand: string;
  briefSummary: string;
  keywordGroupCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  mcpStatus: number | null;
  mcpStatusDesc: string | null;
  fileUrl: string | null;
  hasResult: boolean;
  kolList?: unknown[];
  columns?: string[];
  total?: number;
  createdAt: string;
}

interface TaskResultData {
  projectId: number;
  status: TaskItem['status'];
  mcpStatus: number;
  statusDesc: string;
  fileUrl: string;
  fileName: string;
  kolList: unknown[];
  columns?: string[];
  total?: number;
  raw?: unknown;
}

/* ========== Constants ========== */
const STEPS: { key: StepKey; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'brief', label: '提交Brief', icon: <Target className="h-4 w-4" />, description: '填写品牌、产品与预算需求' },
  { key: 'keywords', label: 'AI生成关键词', icon: <Sparkles className="h-4 w-4" />, description: '智能生成达人搜索关键词方向' },
  { key: 'filters', label: '筛选指标', icon: <Filter className="h-4 w-4" />, description: '确认粉丝量、互动率等筛选条件' },
];

const LIVE_TYPES = ['新品首发', '品牌种草', '测评开箱', '产品测评', '好物推荐', '知识科普'];
const INFLUENCER_TYPES = ['头部', '中腰部', '尾部', '素人'];
const PLATFORMS = ['抖音', '快手', '小红书', 'B站'];

const GROUP_COLORS = ['#4158D0', '#C850C0', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#EC4899'];

const DEFAULT_BRIEF: BriefForm = {
  brand: '',
  product: '',
  targetAudience: '',
  contentDirection: '',
  background: '',
  liveType: '新品首发',
  budget: '5-20万',
  influencerType: '中腰部',
  platform: '抖音',
  priceRanges: {
    lower1: 1000,
    upper1: 50000,
    lower20: 2000,
    upper20: 80000,
    lower60: 5000,
    upper60: 150000,
  },
};

const DEFAULT_FILTERS: FilterForm = {
  minFollowers: 10,
  maxFollowers: 500,
  minEngagement: 1,
  minPlayAvg: 3000,
  kolNumLower: 50,
};

/* ========== Helpers ========== */
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function statusBadge(status: TaskItem['status'], mcpDesc?: string | null) {
  const map: Record<TaskItem['status'], { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
    pending: { label: '排队中', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30', Icon: RefreshCw },
    running: { label: '选号中', cls: 'bg-blue-500/15 text-blue-600 border-blue-500/30', Icon: Spinner },
    completed: { label: '已完成', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', Icon: CheckCircle2 },
    failed: { label: '异常', cls: 'bg-red-500/15 text-red-600 border-red-500/30', Icon: AlertCircle },
  };
  const cfg = map[status] || map.running;
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', cfg.cls)}>
      <cfg.Icon className={cn('h-3 w-3', status === 'running' && 'animate-spin')} />
      {mcpDesc || cfg.label}
    </Badge>
  );
}

/* ========== Step Indicator ========== */
function StepIndicator({ currentStep }: { currentStep: StepKey }) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, idx) => {
        const isActive = idx === currentIndex;
        const isCompleted = idx < currentIndex;
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                  isCompleted
                    ? 'bg-gradient-to-br from-[#4158D0] to-[#C850C0] border-transparent text-white'
                    : isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : step.icon}
              </div>
              <div className="mt-2 text-center">
                <div className={cn('text-sm font-medium', isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground')}>
                  Step {idx + 1}
                </div>
                <div className={cn('text-xs', isActive ? 'text-primary' : 'text-muted-foreground')}>
                  {step.label}
                </div>
              </div>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-4 h-0.5 w-12 md:w-20 rounded-full',
                  isCompleted ? 'bg-gradient-to-r from-[#4158D0] to-[#C850C0]' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ========== Step 1: Brief ========== */
function BriefStep({ form, setForm }: { form: BriefForm; setForm: (f: BriefForm) => void }) {
  const updatePrice = (k: keyof PriceRange, v: string) => {
    const num = Number(v);
    setForm({ ...form, priceRanges: { ...form.priceRanges, [k]: Number.isFinite(num) ? num : 0 } });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 种草范围提示 */}
      <div className="md:col-span-2 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-600 dark:text-blue-400">
          本功能仅支持筛选抖音种草类博主，暂不支持直播带货主播和企业号。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="brand">品牌名称</Label>
        <Input id="brand" placeholder="如：vivo" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="product">产品名称 <span className="text-red-500">*</span></Label>
        <Input id="product" placeholder="如：vivo X200 Pro" value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="audience">目标人群描述</Label>
        <textarea
          id="audience"
          placeholder="描述目标用户画像，如：25-35岁都市白领，追求品质生活，关注科技产品..."
          value={form.targetAudience}
          onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] resize-y"
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="content-direction">内容方向（选填）</Label>
        <Input
          id="content-direction"
          placeholder="如：母婴种草、数码测评、穿搭分享..."
          value={form.contentDirection}
          onChange={(e) => setForm({ ...form, contentDirection: e.target.value })}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="background">项目背景（选填）</Label>
        <Input
          id="background"
          placeholder="补充投放背景信息，帮助AI更精准匹配..."
          value={form.background}
          onChange={(e) => setForm({ ...form, background: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="live-type">直播类型</Label>
        <Select value={form.liveType} onValueChange={(v) => setForm({ ...form, liveType: v })}>
          <SelectTrigger id="live-type"><SelectValue placeholder="选择直播类型" /></SelectTrigger>
          <SelectContent>{LIVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="influencer-type">达人类型</Label>
        <Select value={form.influencerType} onValueChange={(v) => setForm({ ...form, influencerType: v })}>
          <SelectTrigger id="influencer-type"><SelectValue placeholder="选择达人类型" /></SelectTrigger>
          <SelectContent>{INFLUENCER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="platform">投放平台</Label>
        <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
          <SelectTrigger id="platform"><SelectValue placeholder="选择投放平台" /></SelectTrigger>
          <SelectContent>{PLATFORMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="budget">整体预算范围</Label>
        <Select value={form.budget} onValueChange={(v) => setForm({ ...form, budget: v })}>
          <SelectTrigger id="budget"><SelectValue placeholder="选择预算范围" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="0-5万">0 - 5万</SelectItem>
            <SelectItem value="5-20万">5 - 20万</SelectItem>
            <SelectItem value="20-50万">20 - 50万</SelectItem>
            <SelectItem value="50-100万">50 - 100万</SelectItem>
            <SelectItem value="100万+">100万以上</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 刊例价预算 */}
      <div className="md:col-span-2 space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">刊例价预算范围（元）</Label>
          <span className="text-xs text-muted-foreground">用于AI生成合理的达人价格区间</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            { key: '1' as const, label: '1 - 20 秒短视频', lk: 'lower1' as const, uk: 'upper1' as const },
            { key: '20' as const, label: '20 - 60 秒短视频', lk: 'lower20' as const, uk: 'upper20' as const },
            { key: '60' as const, label: '60 秒以上长视频', lk: 'lower60' as const, uk: 'upper60' as const },
          ]).map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={form.priceRanges[item.lk]}
                  onChange={(e) => updatePrice(item.lk, e.target.value)}
                  className="h-9"
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="number"
                  min={0}
                  value={form.priceRanges[item.uk]}
                  onChange={(e) => updatePrice(item.uk, e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ========== Step 2: Keywords ========== */
function KeywordsStep({
  groups,
  setGroups,
  generating,
  onGenerate,
}: {
  groups: MCPKeywordGroup[];
  setGroups: (g: MCPKeywordGroup[]) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  const toggle = (idx: number) => {
    setGroups(groups.map((g, i) => (i === idx ? { ...g, selected: !g.selected } : g)));
  };
  const selectedCount = groups.filter((g) => g.selected).length;
  const hasGenerated = groups.length > 0;

  return (
    <div className="space-y-6">
      {!hasGenerated ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4158D0]/20 to-[#C850C0]/20">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">准备生成关键词方向</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            基于 Brief 中的品牌、产品和目标人群，AI 将为您生成多组抖音达人搜索关键词方向，并给出推荐筛选指标。
          </p>
          <Button
            size="lg"
            onClick={onGenerate}
            disabled={generating}
            className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
          >
            {generating ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> 正在生成中...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" /> AI 生成关键词
              </>
            )}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              AI 已为您生成 <span className="text-foreground font-medium">{groups.length}</span> 个关键词方向，已选择{' '}
              <span className="text-primary font-medium">{selectedCount}</span> 个
            </p>
            <Button variant="outline" size="sm" onClick={onGenerate} disabled={generating}>
              {generating ? <Spinner className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
              重新生成
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g, idx) => {
              const color = GROUP_COLORS[idx % GROUP_COLORS.length];
              // 把 query 拆成片段显示
              const tokens = g.query
                .replace(/[()*]/g, ' ')
                .split(/\s+/)
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 12);
              return (
                <Card
                  key={`${g.content}-${idx}`}
                  className={cn(
                    'cursor-pointer transition-all border-2',
                    g.selected ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-border/80',
                  )}
                  onClick={() => toggle(idx)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2" style={{ color }}>
                        <Lightbulb className="h-5 w-5" />
                        <span className="font-semibold text-foreground">{g.content}</span>
                      </div>
                      <div
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                          g.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                        )}
                      >
                        {g.selected && <Check className="h-3 w-3" />}
                      </div>
                    </div>
                    {g.pass_word && g.pass_word.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mb-2">排除词：{g.pass_word.join('、')}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {tokens.map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px] bg-secondary/50">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ========== Step 3: Filters ========== */
function FiltersStep({
  filters,
  setFilters,
  recommendedMetrics,
}: {
  filters: FilterForm;
  setFilters: (f: FilterForm) => void;
  recommendedMetrics: Record<string, number> | null;
}) {
  return (
    <div className="space-y-8">
      {recommendedMetrics && Object.keys(recommendedMetrics).length > 0 && (
        <div className="rounded-lg border border-[#4158D0]/30 bg-gradient-to-r from-[#4158D0]/5 to-[#C850C0]/5 p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5" />
            <div className="text-xs text-muted-foreground">
              <span className="text-foreground font-medium">AI 推荐指标已自动填入：</span>
              粉丝量 {Math.round((recommendedMetrics.kolFansRangeLower || 0) / 10000)}-
              {Math.round((recommendedMetrics.kolFansRangeUpper || 0) / 10000)} 万，
              互动率 ≥ {((recommendedMetrics.interactionRateAvgLower || 0) * 100).toFixed(2)}%，
              平均播放 ≥ {recommendedMetrics.playAvgLower || 0}，您可以进一步微调。
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">粉丝量范围 (万)</Label>
          <span className="text-sm text-primary font-mono">{filters.minFollowers} - {filters.maxFollowers} 万</span>
        </div>
        <Slider
          value={[filters.minFollowers, filters.maxFollowers]}
          onValueChange={([min, max]) => setFilters({ ...filters, minFollowers: min, maxFollowers: max })}
          min={1}
          max={2000}
          step={10}
          className="py-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1万</span><span>2000万+</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">最低互动率</Label>
          <span className="text-sm text-primary font-mono">{filters.minEngagement}%</span>
        </div>
        <Slider
          value={[filters.minEngagement]}
          onValueChange={([v]) => setFilters({ ...filters, minEngagement: v })}
          min={0}
          max={20}
          step={0.5}
          className="py-2"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">最低平均播放量</Label>
          <span className="text-sm text-primary font-mono">{filters.minPlayAvg.toLocaleString()}</span>
        </div>
        <Slider
          value={[filters.minPlayAvg]}
          onValueChange={([v]) => setFilters({ ...filters, minPlayAvg: v })}
          min={0}
          max={5_000_000}
          step={1000}
          className="py-2"
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">期望达人数</Label>
          <span className="text-sm text-primary font-mono">{filters.kolNumLower} 位</span>
        </div>
        <Slider
          value={[filters.kolNumLower]}
          onValueChange={([v]) => setFilters({ ...filters, kolNumLower: v })}
          min={10}
          max={500}
          step={10}
          className="py-2"
        />
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/30">
        <div>
          <div className="text-sm font-medium text-foreground">仅看认证达人</div>
          <div className="text-xs text-muted-foreground">筛选经过平台认证的优质达人（如 MCP 支持）</div>
        </div>
        <Switch checked={false} onCheckedChange={() => undefined} disabled />
      </div>
    </div>
  );
}

/* ========== Task Result Viewer ========== */
function TaskResultDialog({
  task,
  onClose,
}: {
  task: TaskItem;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaskResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchResult = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-monitor/kol/task-result?projectId=${task.projectId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '查询失败');
      setResult(json.data as TaskResultData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [task.projectId]);

  useEffect(() => {
    void fetchResult();
  }, [fetchResult]);

  const kolList = useMemo<Record<string, unknown>[]>(() => {
    // 优先用后端返回的解析结果
    if (result?.kolList && Array.isArray(result.kolList) && result.kolList.length > 0) {
      return result.kolList as Record<string, unknown>[];
    }
    // 其次用 task 里已存的
    if (task.kolList && Array.isArray(task.kolList) && task.kolList.length > 0) {
      return task.kolList as Record<string, unknown>[];
    }
    // fallback: 从 raw 中提取
    if (!result) return [];
    const raw = result.raw as Record<string, unknown> | undefined;
    if (raw && Array.isArray(raw.kolList)) return raw.kolList as Record<string, unknown>[];
    if (raw && Array.isArray((raw.data as Record<string, unknown>)?.kolList)) {
      return (raw.data as Record<string, unknown>).kolList as Record<string, unknown>[];
    }
    return [];
  }, [result, task.kolList]);

  // 优先用后端返回的 columns，否则自动推断
  const columns = useMemo(() => {
    if (result?.columns && Array.isArray(result.columns) && result.columns.length > 0) {
      return (result.columns as string[]).map((k) => ({ key: k, label: k }));
    }
    if (kolList.length === 0) return [] as { key: string; label: string }[];
    const labelMap: Record<string, string> = {
      nickname: '昵称',
      name: '昵称',
      nickName: '昵称',
      uniqueId: '抖音号',
      shortId: '抖音号',
      douyinId: '抖音号',
      avatar: '头像',
      avatarThumb: '头像',
      followerCount: '粉丝量',
      fansCount: '粉丝量',
      fans: '粉丝量',
      follower: '粉丝量',
      totalFavorited: '总点赞',
      heartCount: '总点赞',
      interactionRate: '互动率',
      interactionRateAvg: '互动率',
      avgPlay: '平均播放',
      playCountAvg: '平均播放',
      avgGmv: '预估GMV',
      gmv: 'GMV',
      productGmv: '商品GMV',
      price1: '1-20s刊例价',
      price20: '20-60s刊例价',
      price60: '60s+刊例价',
      awemeCount: '作品数',
      signature: '签名',
      city: '城市',
      verifyInfo: '认证',
      customVerify: '认证',
    };
    const keys = Object.keys(kolList[0]).slice(0, 10);
    return keys.map((k) => ({ key: k, label: labelMap[k] || k }));
  }, [kolList]);

  const formatValue = (k: string, v: unknown): React.ReactNode => {
    if (v === null || v === undefined || v === '') return '-';
    if (typeof v === 'number') {
      if (/rate/i.test(k)) return `${(v * 100).toFixed(2)}%`;
      if (/fans|follower|heart|favorited|play|gmv|price|count/i.test(k)) {
        if (v >= 100000000) return `${(v / 100000000).toFixed(2)}亿`;
        if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
      }
      return v.toLocaleString();
    }
    if (typeof v === 'string') {
      if (/^https?:\/\//i.test(v) && /avatar|img|cover/i.test(k)) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={v} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />;
      }
      if (/^https?:\/\//i.test(v)) {
        return (
          <a href={v} target="_blank" rel="noreferrer" className="text-primary underline break-all">
            链接 <ExternalLink className="inline h-3 w-3" />
          </a>
        );
      }
      return v.length > 30 ? `${v.slice(0, 30)}...` : v;
    }
    if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
    return String(v);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-xl bg-background shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{task.taskName} - 选号结果</h3>
            <p className="text-xs text-muted-foreground mt-0.5">项目ID: {task.projectId} · 产品: {task.productName}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </div>
        <div className="flex-1 overflow-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Spinner className="h-8 w-8 mb-3" />
              正在加载结果...
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center py-16 text-red-500">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchResult}>重试</Button>
            </div>
          )}
          {!loading && !error && result && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {statusBadge(result.status as TaskItem['status'], result.statusDesc)}
                {result.fileUrl && (
                  <a
                    href={result.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <FileDown className="h-4 w-4" />
                    {result.fileName || '下载结果文件'}
                  </a>
                )}
                <Button variant="outline" size="sm" onClick={fetchResult} disabled={loading}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> 刷新结果
                </Button>
                {(typeof result.total === 'number' || (task.total && task.total > 0)) && (
                  <span className="text-sm text-muted-foreground">共 {result.total || task.total} 位达人</span>
                )}
              </div>

              {result.status !== 'completed' && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-blue-700">
                  选号进行中，预计30分钟~2小时，请稍后刷新查看。当前状态：{result.statusDesc || '处理中'}
                </div>
              )}

              {kolList.length > 0 ? (
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {columns.map((c) => (
                          <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {kolList.map((row, i) => (
                        <TableRow key={i}>
                          {columns.map((c) => (
                            <TableCell key={c.key} className="whitespace-nowrap max-w-[240px]">
                              {formatValue(c.key, row[c.key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : result.status === 'completed' ? (
                <div className="rounded-lg border border-border bg-secondary/20 p-8 text-center text-sm text-muted-foreground">
                  任务已完成，但未在响应中返回结构化达人列表。
                  {result.fileUrl && ' 请下载结果文件查看完整达人数据。'}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========== Task List ========== */
function TaskList({ refreshKey }: { refreshKey: number }) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeResult, setActiveResult] = useState<TaskItem | null>(null);
  const pollTimersRef = useRef<Record<string, number>>({});

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/market-monitor/kol/tasks', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '加载失败');
      setTasks(json.data as TaskItem[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchTasks();
  }, [fetchTasks, refreshKey]);

  // 对未完成任务轮询
  useEffect(() => {
    // 清理旧定时器
    Object.values(pollTimersRef.current).forEach((t) => window.clearInterval(t));
    pollTimersRef.current = {};

    const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'running');
    if (pending.length === 0) return;

    const counts: Record<string, number> = {};
    pending.forEach((t) => {
      counts[t.projectId] = 0;
      pollTimersRef.current[t.projectId] = window.setInterval(async () => {
        counts[t.projectId] += 1;
        if (counts[t.projectId] > 240) {
          window.clearInterval(pollTimersRef.current[t.projectId]);
          return;
        }
        try {
          const res = await fetch(
            `/api/market-monitor/kol/task-result?projectId=${t.projectId}`,
            { cache: 'no-store' },
          );
          const json = await res.json();
          if (json.success && json.data) {
            const newStatus = json.data.status as TaskItem['status'];
            if (newStatus === 'completed' || newStatus === 'failed') {
              window.clearInterval(pollTimersRef.current[t.projectId]);
              // 局部更新列表
              setTasks((prev) =>
                prev.map((x) =>
                  x.projectId === t.projectId
                    ? {
                        ...x,
                        status: newStatus,
                        mcpStatus: json.data.mcpStatus,
                        mcpStatusDesc: json.data.statusDesc,
                        fileUrl: json.data.fileUrl || null,
                        hasResult: !!json.data.fileUrl || (Array.isArray(json.data.kolList) && json.data.kolList.length > 0),
                        kolList: Array.isArray(json.data.kolList) ? json.data.kolList : undefined,
                        columns: Array.isArray(json.data.columns) ? json.data.columns : undefined,
                        total: typeof json.data.total === 'number' ? json.data.total : undefined,
                      }
                    : x,
                ),
              );
            }
          }
        } catch {
          /* ignore poll error */
        }
      }, 30_000);
    });

    return () => {
      Object.values(pollTimersRef.current).forEach((t) => window.clearInterval(t));
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Spinner className="h-8 w-8 mb-3" />
        正在加载任务列表...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center py-20 text-red-500">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p className="text-sm">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={fetchTasks}>重试</Button>
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <ListChecks className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-sm">暂无选号任务，去创建一个吧～</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务名称</TableHead>
              <TableHead>产品</TableHead>
              <TableHead className="text-center">关键词方向</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium text-foreground max-w-[240px] truncate">{t.taskName}</TableCell>
                <TableCell>{t.brand ? `${t.brand} / ` : ''}{t.productName}</TableCell>
                <TableCell className="text-center">{t.keywordGroupCount}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{formatDateTime(t.createdAt)}</TableCell>
                <TableCell>{statusBadge(t.status, t.mcpStatusDesc)}</TableCell>
                <TableCell className="text-right">
                  {t.status === 'completed' || t.hasResult ? (
                    <Button size="sm" variant="outline" onClick={() => setActiveResult(t)}>
                      查看结果
                    </Button>
                  ) : t.status === 'failed' ? (
                    <Button size="sm" variant="ghost" disabled>异常</Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled className="text-muted-foreground">
                      <Spinner className="h-3 w-3 mr-1 animate-spin" /> 处理中
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {activeResult && <TaskResultDialog task={activeResult} onClose={() => setActiveResult(null)} />}
    </>
  );
}

/* ========== Main Page ========== */
export default function KolPage() {
  const [mainTab, setMainTab] = useState<MainTab>('new');
  const [currentStep, setCurrentStep] = useState<StepKey>('brief');
  const [briefForm, setBriefForm] = useState<BriefForm>(DEFAULT_BRIEF);
  const [keywordGroups, setKeywordGroups] = useState<MCPKeywordGroup[]>([]);
  const [recommendedMetrics, setRecommendedMetrics] = useState<Record<string, number> | null>(null);
  const [recommendedUserMetrics, setRecommendedUserMetrics] = useState<Record<string, number> | null>(null);
  const [contword, setContword] = useState<string[]>([]);
  const [suggestedTaskName, setSuggestedTaskName] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ projectId: number } | null>(null);
  const [filters, setFilters] = useState<FilterForm>(DEFAULT_FILTERS);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'brief':
        return briefForm.brand.trim() && briefForm.product.trim();
      case 'keywords':
        return keywordGroups.some((g) => g.selected);
      case 'filters':
        return true;
      default:
        return true;
    }
  };

  const handleGenerateKeywords = useCallback(async () => {
    if (!briefForm.product.trim()) {
      setGenError('请先填写产品名称');
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/market-monitor/kol/generate-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: briefForm.brand,
          product: briefForm.product,
          targetAudience: briefForm.targetAudience,
          liveType: briefForm.liveType,
          budget: briefForm.budget,
          platform: briefForm.platform,
          influencerType: briefForm.influencerType,
          priceRanges: briefForm.priceRanges,
          content_direction: briefForm.contentDirection,
          background: briefForm.background,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '生成失败');
      const data = json.data as {
        keyword_groups: Array<{ content: string; query: string; pass_word: string[] }>;
        metrics: Record<string, number>;
        user_metrics: Record<string, number>;
        contword: string[];
        task_name: string;
      };
      setKeywordGroups(
        (data.keyword_groups || []).map((g) => ({ ...g, selected: true })),
      );
      setRecommendedMetrics(data.metrics || {});
      setRecommendedUserMetrics(data.user_metrics || {});
      setContword(data.contword || []);
      setSuggestedTaskName(data.task_name || '');

      // 自动用AI指标更新filters
      if (data.metrics) {
        const m = data.metrics;
        setFilters((prev) => ({
          ...prev,
          minFollowers: Math.max(1, Math.round((Number(m.kolFansRangeLower) || prev.minFollowers * 10000) / 10000)),
          maxFollowers: Math.max(1, Math.round((Number(m.kolFansRangeUpper) || prev.maxFollowers * 10000) / 10000)),
          minEngagement: Number(m.interactionRateAvgLower) ? Number(m.interactionRateAvgLower) * 100 : prev.minEngagement,
          minPlayAvg: Number(m.playAvgLower) || prev.minPlayAvg,
          kolNumLower: Number(m.kolNumLower) || prev.kolNumLower,
        }));
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [briefForm]);

  const handleNext = () => {
    setSubmitError(null);
    if (currentStep === 'brief' && currentIndex < STEPS.length - 1) {
      // 进入关键词步骤时，如果还没生成则提示生成
      setCurrentStep(STEPS[currentIndex + 1].key);
      return;
    }
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key);
    } else {
      void handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentStep(STEPS[currentIndex - 1].key);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const selectedGroups = keywordGroups.filter((g) => g.selected);
      const metrics: Record<string, number> = {
        ...(recommendedMetrics || {}),
        kolFansRangeLower: filters.minFollowers * 10000,
        kolFansRangeUpper: filters.maxFollowers * 10000,
        kolNumLower: filters.kolNumLower,
        priceLower1: briefForm.priceRanges.lower1,
        priceUpper1: briefForm.priceRanges.upper1,
        priceLower20: briefForm.priceRanges.lower20,
        priceUpper20: briefForm.priceRanges.upper20,
        priceLower60: briefForm.priceRanges.lower60,
        priceUpper60: briefForm.priceRanges.upper60,
      };
      if (filters.minEngagement > 0) {
        metrics.interactionRateAvgLower = filters.minEngagement / 100;
      }
      if (filters.minPlayAvg > 0) {
        metrics.playAvgLower = filters.minPlayAvg;
      }

      const res = await fetch('/api/market-monitor/kol/create-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_name: suggestedTaskName || `${briefForm.product} 选号任务`,
          product_name: briefForm.product,
          brand: briefForm.brand,
          brief_summary: [
            briefForm.brand && `品牌：${briefForm.brand}`,
            `产品：${briefForm.product}`,
            briefForm.targetAudience && `目标人群：${briefForm.targetAudience}`,
            `直播类型：${briefForm.liveType}`,
            `预算：${briefForm.budget}`,
            `平台：${briefForm.platform}`,
            `达人类型：${briefForm.influencerType}`,
          ].filter(Boolean).join('\n'),
          keyword_groups: selectedGroups.map((g) => ({
            content: g.content,
            query: g.query,
            pass_word: g.pass_word,
          })),
          metrics,
          user_metrics: recommendedUserMetrics || {
            priceLower1: briefForm.priceRanges.lower1,
            priceUpper1: briefForm.priceRanges.upper1,
            priceLower20: briefForm.priceRanges.lower20,
            priceUpper20: briefForm.priceRanges.upper20,
            priceLower60: briefForm.priceRanges.lower60,
            priceUpper60: briefForm.priceRanges.upper60,
          },
          contword,
          entity_report: {
            product: briefForm.product,
            platform: briefForm.platform,
            brand: briefForm.brand,
            influencer_type: briefForm.influencerType,
            content_direction: briefForm.contentDirection,
            background: briefForm.background,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '提交失败');

      const data = json.data as { projectId: number };

      // 重置表单但保留在新建tab
      setCurrentStep('brief');
      setBriefForm(DEFAULT_BRIEF);
      setKeywordGroups([]);
      setRecommendedMetrics(null);
      setRecommendedUserMetrics(null);
      setContword([]);
      setSuggestedTaskName('');
      setFilters(DEFAULT_FILTERS);
      setTasksRefreshKey((k) => k + 1);

      // 显示成功提示
      setSubmitSuccess({ projectId: data.projectId });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            达人选号
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            基于 AI 关键词智能匹配，从抖音达人池中筛选符合品牌需求的优质达人
          </p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
        <TabsList>
          <TabsTrigger value="new" className="gap-1.5">
            <PlusCircle className="h-4 w-4" /> 新建选号任务
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-1.5">
            <ListChecks className="h-4 w-4" /> 我的任务
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-6">
          <div className="max-w-4xl mx-auto">
            <StepIndicator currentStep={currentStep} />

            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {STEPS[currentIndex].icon}
                  {STEPS[currentIndex].label}
                </CardTitle>
                <CardDescription>{STEPS[currentIndex].description}</CardDescription>
              </CardHeader>
              <CardContent>
                {genError && (
                  <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                    {genError}
                  </div>
                )}
                {submitError && (
                  <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                    {submitError}
                  </div>
                )}
                {submitSuccess && (
                  <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          选号任务已提交（任务号：{submitSuccess.projectId}）
                        </p>
                        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70 mt-1">
                          预计需要30分钟~2小时完成。完成后达人名单会自动同步到任务列表，您可以随时在「我的任务」中查看进度。
                        </p>
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSubmitSuccess(null);
                              setMainTab('tasks');
                            }}
                          >
                            查看任务列表
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setSubmitSuccess(null)}
                          >
                            继续创建
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 'brief' && <BriefStep form={briefForm} setForm={setBriefForm} />}
                {currentStep === 'keywords' && (
                  <KeywordsStep
                    groups={keywordGroups}
                    setGroups={setKeywordGroups}
                    generating={generating}
                    onGenerate={handleGenerateKeywords}
                  />
                )}
                {currentStep === 'filters' && (
                  <FiltersStep
                    filters={filters}
                    setFilters={setFilters}
                    recommendedMetrics={recommendedMetrics}
                  />
                )}
              </CardContent>

              <div className="flex items-center justify-between px-6 pb-6">
                <Button variant="outline" onClick={handlePrev} disabled={currentIndex === 0 || submitting}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> 上一步
                </Button>
                <Button
                  onClick={handleNext}
                  disabled={!canProceed() || generating || submitting}
                  className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
                >
                  {submitting ? (
                    <>
                      <Spinner className="h-4 w-4 mr-1" /> 提交中...
                    </>
                  ) : currentIndex === STEPS.length - 1 ? (
                    <>
                      <Check className="h-4 w-4 mr-1" /> 提交选号
                    </>
                  ) : currentStep === 'brief' ? (
                    <>
                      下一步
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  ) : (
                    <>
                      下一步
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <TaskList refreshKey={tasksRefreshKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
