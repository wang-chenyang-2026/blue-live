'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Users,
  Target,
  Filter,
  CheckCircle2,
  Circle,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ========== Types ========== */
type StepKey = 'brief' | 'keywords' | 'filters';

interface BriefForm {
  brand: string;
  product: string;
  targetAudience: string;
  liveType: string;
  budget: string;
}

interface KeywordGroup {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  selected: boolean;
  color: string;
}

interface FilterForm {
  minFollowers: number;
  maxFollowers: number;
  minEngagement: number;
  minGmv: number;
  platforms: string[];
  categories: string[];
  verifiedOnly: boolean;
}

/* ========== Steps Config ========== */
const STEPS: { key: StepKey; label: string; icon: React.ReactNode; description: string }[] = [
  { key: 'brief', label: '提交Brief', icon: <Target className="h-4 w-4" />, description: '填写品牌与产品需求' },
  { key: 'keywords', label: 'AI生成关键词', icon: <Sparkles className="h-4 w-4" />, description: '智能匹配关键词方向' },
  { key: 'filters', label: '筛选指标', icon: <Filter className="h-4 w-4" />, description: '精细筛选达人条件' },
];

const LIVE_TYPES = ['新品首发', '日常带货', '大促专场', '品牌种草', '达人专场', '测评开箱'];
const PLATFORMS = ['抖音', '快手', '小红书', 'B站'];
const CATEGORIES = ['数码科技', '生活方式', '美妆个护', '游戏电竞', '知识科普', '美食', '时尚'];

/* ========== Mock Keyword Groups ========== */
const MOCK_KEYWORD_GROUPS: KeywordGroup[] = [
  {
    id: '1',
    title: '数码测评类',
    description: '专业数码测评达人，用户信任度高',
    keywords: ['数码测评', '手机评测', '开箱体验', '参数对比'],
    selected: true,
    color: '#4158D0',
  },
  {
    id: '2',
    title: '科技资讯类',
    description: '科技资讯博主，粉丝活跃度高',
    keywords: ['科技资讯', '数码前沿', '新品发布', '行业动态'],
    selected: true,
    color: '#C850C0',
  },
  {
    id: '3',
    title: '生活方式类',
    description: '生活方式博主，种草转化好',
    keywords: ['生活好物', '日常分享', '品质生活', '种草推荐'],
    selected: false,
    color: '#10B981',
  },
  {
    id: '4',
    title: '游戏电竞类',
    description: '游戏主播，性能展示效果佳',
    keywords: ['游戏主播', '电竞解说', '性能测试', '手游推荐'],
    selected: false,
    color: '#F59E0B',
  },
  {
    id: '5',
    title: '学生数码类',
    description: '学生党数码博主，性价比导向',
    keywords: ['学生党', '性价比', '千元机', '开学季'],
    selected: false,
    color: '#EF4444',
  },
  {
    id: '6',
    title: '影像创作类',
    description: '摄影摄像达人，突出影像能力',
    keywords: ['手机摄影', 'vlog', '影像创作', '拍照测评'],
    selected: false,
    color: '#8B5CF6',
  },
];

/* ========== Step Indicator ========== */
function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: StepKey;
  steps: typeof STEPS;
}) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, idx) => {
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
                <div
                  className={cn(
                    'text-sm font-medium',
                    isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  Step {idx + 1}
                </div>
                <div
                  className={cn(
                    'text-xs',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </div>
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'mx-4 h-0.5 w-16 md:w-24 rounded-full',
                  isCompleted
                    ? 'bg-gradient-to-r from-[#4158D0] to-[#C850C0]'
                    : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ========== Step 1: Brief Form ========== */
function BriefStep({
  form,
  setForm,
}: {
  form: BriefForm;
  setForm: (f: BriefForm) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-2">
        <Label htmlFor="brand">品牌名称</Label>
        <Input
          id="brand"
          placeholder="如：vivo"
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="product">产品名称</Label>
        <Input
          id="product"
          placeholder="如：vivo X200 Pro"
          value={form.product}
          onChange={(e) => setForm({ ...form, product: e.target.value })}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="audience">目标人群描述</Label>
        <textarea
          id="audience"
          placeholder="描述目标用户画像，如：25-35岁都市白领，追求品质生活，关注科技产品..."
          value={form.targetAudience}
          onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
          className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="live-type">直播类型</Label>
        <Select value={form.liveType} onValueChange={(v) => setForm({ ...form, liveType: v })}>
          <SelectTrigger id="live-type">
            <SelectValue placeholder="选择直播类型" />
          </SelectTrigger>
          <SelectContent>
            {LIVE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="budget">预算范围</Label>
        <Select value={form.budget} onValueChange={(v) => setForm({ ...form, budget: v })}>
          <SelectTrigger id="budget">
            <SelectValue placeholder="选择预算范围" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0-5万">0 - 5万</SelectItem>
            <SelectItem value="5-20万">5 - 20万</SelectItem>
            <SelectItem value="20-50万">20 - 50万</SelectItem>
            <SelectItem value="50-100万">50 - 100万</SelectItem>
            <SelectItem value="100万+">100万以上</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ========== Step 2: AI Keywords ========== */
function KeywordsStep({
  groups,
  setGroups,
  generating,
  onRegenerate,
}: {
  groups: KeywordGroup[];
  setGroups: (g: KeywordGroup[]) => void;
  generating: boolean;
  onRegenerate: () => void;
}) {
  const toggleGroup = (id: string) => {
    setGroups(
      groups.map((g) => (g.id === id ? { ...g, selected: !g.selected } : g)),
    );
  };

  const selectedCount = groups.filter((g) => g.selected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            AI 已为您生成 {groups.length} 个关键词方向，已选择 <span className="text-primary font-medium">{selectedCount}</span> 个
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={generating}>
          <Sparkles className={cn('h-4 w-4 mr-1', generating && 'animate-spin')} />
          重新生成
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <Card
            key={group.id}
            className={cn(
              'cursor-pointer transition-all border-2',
              group.selected
                ? 'border-primary/50 bg-primary/5'
                : 'border-border hover:border-border/80',
            )}
            onClick={() => toggleGroup(group.id)}
          >
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div
                  className="flex items-center gap-2"
                  style={{ color: group.color }}
                >
                  <Lightbulb className="h-5 w-5" />
                  <span className="font-semibold text-foreground">{group.title}</span>
                </div>
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                    group.selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border',
                  )}
                >
                  {group.selected && <Check className="h-3 w-3" />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{group.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.keywords.map((kw) => (
                  <Badge
                    key={kw}
                    variant="secondary"
                    className="text-[10px] bg-secondary/50"
                  >
                    {kw}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ========== Step 3: Filters ========== */
function FiltersStep({
  filters,
  setFilters,
}: {
  filters: FilterForm;
  setFilters: (f: FilterForm) => void;
}) {
  const togglePlatform = (p: string) => {
    if (filters.platforms.includes(p)) {
      setFilters({ ...filters, platforms: filters.platforms.filter((x) => x !== p) });
    } else {
      setFilters({ ...filters, platforms: [...filters.platforms, p] });
    }
  };

  const toggleCategory = (c: string) => {
    if (filters.categories.includes(c)) {
      setFilters({ ...filters, categories: filters.categories.filter((x) => x !== c) });
    } else {
      setFilters({ ...filters, categories: [...filters.categories, c] });
    }
  };

  return (
    <div className="space-y-8">
      {/* Follower Range */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">粉丝量范围 (万)</Label>
          <span className="text-sm text-primary font-mono">
            {filters.minFollowers} - {filters.maxFollowers} 万
          </span>
        </div>
        <Slider
          value={[filters.minFollowers, filters.maxFollowers]}
          onValueChange={([min, max]) => setFilters({ ...filters, minFollowers: min, maxFollowers: max })}
          min={1}
          max={1000}
          step={10}
          className="py-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>1万</span>
          <span>1000万+</span>
        </div>
      </div>

      {/* Engagement Rate */}
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
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>20%+</span>
        </div>
      </div>

      {/* Min GMV */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base">最低带货GMV (万元/月)</Label>
          <span className="text-sm text-primary font-mono">{filters.minGmv} 万</span>
        </div>
        <Slider
          value={[filters.minGmv]}
          onValueChange={([v]) => setFilters({ ...filters, minGmv: v })}
          min={0}
          max={500}
          step={10}
          className="py-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0</span>
          <span>500万+</span>
        </div>
      </div>

      {/* Platforms */}
      <div className="space-y-3">
        <Label className="text-base">投放平台</Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <Button
              key={p}
              variant={filters.platforms.includes(p) ? 'default' : 'outline'}
              size="sm"
              onClick={() => togglePlatform(p)}
              className={cn(
                filters.platforms.includes(p) &&
                  'bg-gradient-to-r from-[#4158D0] to-[#C850C0] border-0',
              )}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        <Label className="text-base">达人分类</Label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Button
              key={c}
              variant={filters.categories.includes(c) ? 'default' : 'outline'}
              size="sm"
              onClick={() => toggleCategory(c)}
              className={cn(
                filters.categories.includes(c) &&
                  'bg-gradient-to-r from-[#4158D0] to-[#C850C0] border-0',
              )}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Verified Only */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-secondary/30">
        <div>
          <div className="text-sm font-medium text-foreground">仅看认证达人</div>
          <div className="text-xs text-muted-foreground">筛选经过平台认证的优质达人</div>
        </div>
        <Switch
          checked={filters.verifiedOnly}
          onCheckedChange={(v) => setFilters({ ...filters, verifiedOnly: v })}
        />
      </div>
    </div>
  );
}

/* ========== Main Component ========== */
export default function KolPage() {
  const [currentStep, setCurrentStep] = useState<StepKey>('brief');
  const [briefForm, setBriefForm] = useState<BriefForm>({
    brand: '',
    product: '',
    targetAudience: '',
    liveType: '新品首发',
    budget: '5-20万',
  });
  const [keywordGroups, setKeywordGroups] = useState<KeywordGroup[]>(MOCK_KEYWORD_GROUPS);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState<FilterForm>({
    minFollowers: 10,
    maxFollowers: 500,
    minEngagement: 3,
    minGmv: 50,
    platforms: ['抖音'],
    categories: ['数码科技'],
    verifiedOnly: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case 'brief':
        return briefForm.brand.trim() && briefForm.product.trim();
      case 'keywords':
        return keywordGroups.some((g) => g.selected);
      case 'filters':
        return filters.platforms.length > 0;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key);
    } else {
      setSubmitted(true);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1].key);
    }
  };

  const handleRegenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setKeywordGroups(
        MOCK_KEYWORD_GROUPS.map((g) => ({
          ...g,
          selected: Math.random() > 0.5,
        })),
      );
      setGenerating(false);
    }, 1500);
  };

  const handleReset = () => {
    setSubmitted(false);
    setCurrentStep('brief');
    setBriefForm({
      brand: '',
      product: '',
      targetAudience: '',
      liveType: '新品首发',
      budget: '5-20万',
    });
    setKeywordGroups(MOCK_KEYWORD_GROUPS);
    setFilters({
      minFollowers: 10,
      maxFollowers: 500,
      minEngagement: 3,
      minGmv: 50,
      platforms: ['抖音'],
      categories: ['数码科技'],
      verifiedOnly: false,
    });
  };

  // Success State
  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#4158D0]/20 to-[#C850C0]/20">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">选号任务已提交</h2>
            <p className="text-muted-foreground mb-6">
              系统将根据您的筛选条件，为您匹配最合适的达人列表
            </p>

            <div className="rounded-lg border border-border bg-secondary/30 p-5 text-left space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">品牌</span>
                <span className="text-sm font-medium text-foreground">{briefForm.brand || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">产品</span>
                <span className="text-sm font-medium text-foreground">{briefForm.product || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">关键词方向</span>
                <span className="text-sm font-medium text-foreground">
                  {keywordGroups.filter((g) => g.selected).length} 个方向
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">粉丝量范围</span>
                <span className="text-sm font-medium text-foreground">
                  {filters.minFollowers} - {filters.maxFollowers} 万
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">投放平台</span>
                <span className="text-sm font-medium text-foreground">
                  {filters.platforms.join('、')}
                </span>
              </div>
            </div>

            <Button
              onClick={handleReset}
              className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
            >
              新建选号任务
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step Indicator */}
      <StepIndicator currentStep={currentStep} steps={STEPS} />

      {/* Content Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {STEPS[currentIndex].label}
          </CardTitle>
          <CardDescription>{STEPS[currentIndex].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 'brief' && (
            <BriefStep form={briefForm} setForm={setBriefForm} />
          )}
          {currentStep === 'keywords' && (
            <KeywordsStep
              groups={keywordGroups}
              setGroups={setKeywordGroups}
              generating={generating}
              onRegenerate={handleRegenerate}
            />
          )}
          {currentStep === 'filters' && (
            <FiltersStep filters={filters} setFilters={setFilters} />
          )}
        </CardContent>

        {/* Navigation */}
        <div className="flex items-center justify-between px-6 pb-6">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            上一步
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
          >
            {currentIndex === STEPS.length - 1 ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                提交选号
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
  );
}
