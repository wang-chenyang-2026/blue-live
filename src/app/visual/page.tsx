'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/contexts/AppContext';
import {
  RefreshCw,
  X,
  Palette,
  Image as ImageIcon,
  Calendar,
  User,
  Tag,
  TrendingUp,
  Clock,
  Users,
  Lightbulb,
  FileText,
  MessageSquare,
  Eye,
} from 'lucide-react';

/* ========== Types ========== */
interface VisualItem {
  brand: string;
  creator: string;
  category: string;
  name: string;
  imageUrl: string;
  startDate: string;
  endDate: string;
  exposureRatePeople: number | null;
  exposureRateCount: number | null;
  avgStayDuration: string;
  avgFollowRate: string;
  designInspiration: string;
  designPlan: string;
  evaluation: string;
}

/* ========== Constants ========== */
const BRAND_FILTERS = [
  { id: 'top', label: 'TOP视觉', color: '#a78bfa' },
  { id: 'vivo', label: 'vivo', color: '#415FFF' },
  { id: 'iQOO抖音', label: 'iQOO抖音', color: '#FF6B35' },
  { id: 'iQOO快手', label: 'iQOO快手', color: '#FF6B35' },
] as const;

const CATEGORY_OPTIONS = ['日播', '发布会', '主题'] as const;

const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMjcyNzJiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzcxNzE3YSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPuWbvueJh+OAgOWFs+mqlTwvdGV4dD48L3N2Zz4=';

/* ========== Helper: Parse date to days diff ========== */
function daysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/* ========== Helper: Map brand filter to API brand param ========== */
function brandFilterToApiParam(filterId: string): string {
  switch (filterId) {
    case 'vivo': return 'vivo';
    case 'iQOO抖音': return 'iQOO抖音';
    case 'iQOO快手': return 'iQOO快手';
    default: return '';
  }
}

/* ========== TOP视觉 Logic ========== */
function computeTopVisuals(allItems: VisualItem[]): VisualItem[] {
  // Step 1: Filter items with usage period > 7 days
  const eligible = allItems.filter((item) => daysBetween(item.startDate, item.endDate) > 7);

  // Step 2: Group by name, compute average exposureRatePeople per name
  const nameGroups = new Map<string, { items: VisualItem[]; avgExposure: number }>();
  for (const item of eligible) {
    if (!item.name) continue;
    const existing = nameGroups.get(item.name);
    if (existing) {
      existing.items.push(item);
      const exposures = existing.items
        .map((i) => i.exposureRatePeople)
        .filter((v): v is number => v !== null);
      existing.avgExposure = exposures.length > 0
        ? exposures.reduce((s, v) => s + v, 0) / exposures.length
        : 0;
    } else {
      const exp = item.exposureRatePeople ?? 0;
      nameGroups.set(item.name, { items: [item], avgExposure: exp });
    }
  }

  // Step 3: Group by brand, find the highest exposureRatePeople in each brand
  // Map brand names from data to our filter categories
  const brandMap: Record<string, string> = {};
  for (const item of allItems) {
    const b = item.brand.toLowerCase();
    if (b === 'vivo') brandMap[item.brand] = 'vivo';
    else if (b.includes('iqoo') && b.includes('抖音')) brandMap[item.brand] = 'iQOO抖音';
    else if (b.includes('iqoo') && b.includes('快手')) brandMap[item.brand] = 'iQOO快手';
    else if (b.includes('iqoo')) {
      // Default iQOO without platform specification
      brandMap[item.brand] = 'iQOO抖音';
    }
  }

  // For each brand category, find the best visual (highest avg exposure)
  const brandBest = new Map<string, { name: string; avgExposure: number; representative: VisualItem }>();

  for (const [name, group] of nameGroups) {
    // Determine which brand categories this name's items belong to
    const brandCategories = new Set<string>();
    for (const item of group.items) {
      const mapped = brandMap[item.brand];
      if (mapped) brandCategories.add(mapped);
    }

    for (const brandCat of brandCategories) {
      const itemsForBrand = group.items.filter(
        (item) => brandMap[item.brand] === brandCat
      );
      if (itemsForBrand.length === 0) continue;

      // Compute brand-specific avg exposure
      const exposures = itemsForBrand
        .map((i) => i.exposureRatePeople)
        .filter((v): v is number => v !== null);
      const brandAvg = exposures.length > 0
        ? exposures.reduce((s, v) => s + v, 0) / exposures.length
        : 0;

      const current = brandBest.get(brandCat);
      if (!current || brandAvg > current.avgExposure) {
        // Use the item with highest individual exposure as representative
        const bestItem = itemsForBrand.reduce((best, curr) =>
          (curr.exposureRatePeople ?? 0) > (best.exposureRatePeople ?? 0) ? curr : best
        );
        brandBest.set(brandCat, { name, avgExposure: brandAvg, representative: bestItem });
      }
    }
  }

  // Step 4: Return one per brand, max 3
  const result: VisualItem[] = [];
  for (const brandId of ['vivo', 'iQOO抖音', 'iQOO快手']) {
    const best = brandBest.get(brandId);
    if (best) {
      result.push(best.representative);
    }
  }
  return result;
}

/* ========== Main Component ========== */
export default function VisualPage() {
  const { isClient } = useApp();
  const [allItems, setAllItems] = useState<VisualItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>('top');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [selectedItem, setSelectedItem] = useState<VisualItem | null>(null);

  /* ========== Data Fetching ========== */
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/feishu/visual-stats');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '获取数据失败');
      setAllItems(json.data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  /* ========== Filtered Display Items ========== */
  const displayItems = useMemo(() => {
    let items: VisualItem[];

    if (selectedBrand === 'top') {
      // TOP视觉: apply category filter then compute top
      let pool = allItems;
      if (selectedCategories.length < CATEGORY_OPTIONS.length) {
        pool = pool.filter((item) => selectedCategories.includes(item.category));
      }
      items = computeTopVisuals(pool);
    } else {
      // Brand-specific filter
      const apiParam = brandFilterToApiParam(selectedBrand);
      items = allItems.filter(
        (item) => item.brand.toLowerCase() === apiParam.toLowerCase()
      );
      // Apply category filter
      if (selectedCategories.length < CATEGORY_OPTIONS.length) {
        items = items.filter((item) => selectedCategories.includes(item.category));
      }
    }

    // Limit to 10
    return items.slice(0, 10);
  }, [allItems, selectedBrand, selectedCategories]);

  /* ========== Category Toggle ========== */
  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        // Don't allow deselecting all
        if (prev.length === 1) return prev;
        return prev.filter((c) => c !== cat);
      }
      return [...prev, cat];
    });
  };

  /* ========== SSR Guard ========== */
  if (!isClient) {
    return <div className="h-8 w-48 bg-muted animate-pulse rounded" />;
  }

  /* ========== Render ========== */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">视觉统计</h1>
          <p className="text-sm text-muted-foreground mt-1">直播间视觉素材效果追踪与分析</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          onClick={fetchAllData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Brand Filter (Left) */}
        <div className="flex items-center gap-1.5">
          {BRAND_FILTERS.map((bf) => (
            <Button
              key={bf.id}
              variant={selectedBrand === bf.id ? 'default' : 'outline'}
              size="sm"
              className={
                selectedBrand === bf.id
                  ? 'hover:opacity-90'
                  : 'border-zinc-600 text-zinc-300'
              }
              style={
                selectedBrand === bf.id
                  ? { backgroundColor: bf.color }
                  : {}
              }
              onClick={() => setSelectedBrand(bf.id)}
            >
              {bf.label}
            </Button>
          ))}
        </div>

        <div className="h-5 w-px bg-zinc-700" />

        {/* Category Filter (Right) */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-500 mr-1">分类:</span>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                selectedCategories.includes(cat)
                  ? 'bg-zinc-700 text-zinc-100 font-medium'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && allItems.length === 0 && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="flex items-center gap-2 text-zinc-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span>正在加载视觉数据...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && allItems.length === 0 && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="text-center space-y-3">
            <p className="text-red-400">{error}</p>
            <Button variant="outline" onClick={fetchAllData}>重试</Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && displayItems.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="py-16 text-center">
            <Palette className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              暂无视觉数据
            </h3>
            <p className="text-sm text-muted-foreground">
              数据源待填充，请在飞书电子表格中添加视觉素材数据
            </p>
          </CardContent>
        </Card>
      )}

      {/* Visual Grid */}
      {displayItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayItems.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="group cursor-pointer"
              onClick={() => setSelectedItem(item)}
            >
              <div className="relative aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/50 group-hover:border-zinc-500 transition-colors">
                <img
                  src={item.imageUrl || PLACEHOLDER_IMAGE}
                  alt={item.name || '视觉素材'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                  }}
                />
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                {/* Brand badge */}
                <div className="absolute top-2 left-2">
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-black/60 text-white border-none"
                  >
                    {item.brand}
                  </Badge>
                </div>
                {/* Category badge */}
                {item.category && (
                  <div className="absolute top-2 right-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-black/60 text-zinc-300 border-zinc-600"
                    >
                      {item.category}
                    </Badge>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-300 text-center truncate">
                {item.name || '未命名'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}

/* ========== Detail Modal Component ========== */
function DetailModal({ item, onClose }: { item: VisualItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative z-10 bg-zinc-900 border border-zinc-700 rounded-xl w-[95vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">
              {item.name || '视觉详情'}
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs bg-zinc-800 text-zinc-300 border-zinc-600">
                {item.brand}
              </Badge>
              {item.category && (
                <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                  {item.category}
                </Badge>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-foreground hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Image */}
            <div className="space-y-4">
              <div className="aspect-square rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
                <img
                  src={item.imageUrl || PLACEHOLDER_IMAGE}
                  alt={item.name || '视觉素材'}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = PLACEHOLDER_IMAGE;
                  }}
                />
              </div>
              {item.designInspiration && (
                <Card className="bg-zinc-800/50 border-zinc-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      设计灵感
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-200 leading-relaxed">{item.designInspiration}</p>
                  </CardContent>
                </Card>
              )}
              {item.designPlan && (
                <Card className="bg-zinc-800/50 border-zinc-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      设计方案
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-200 leading-relaxed">{item.designPlan}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: Data Fields */}
            <div className="space-y-4">
              {/* Basic Info */}
              <Card className="bg-zinc-800/50 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400">基础信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow icon={<Tag className="h-3.5 w-3.5" />} label="品牌" value={item.brand} />
                  <InfoRow icon={<User className="h-3.5 w-3.5" />} label="素材制作者" value={item.creator} />
                  <InfoRow icon={<ImageIcon className="h-3.5 w-3.5" />} label="分类" value={item.category} />
                  <InfoRow icon={<Palette className="h-3.5 w-3.5" />} label="视觉命名" value={item.name} />
                </CardContent>
              </Card>

              {/* Usage Period */}
              <Card className="bg-zinc-800/50 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    使用周期
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="开始日期" value={item.startDate || '未设置'} />
                  <InfoRow icon={<Calendar className="h-3.5 w-3.5" />} label="结束日期" value={item.endDate || '未设置'} />
                  {item.startDate && item.endDate && (
                    <div className="text-xs text-zinc-500 pl-5">
                      共计 {daysBetween(item.startDate, item.endDate)} 天
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Performance Metrics */}
              <Card className="bg-zinc-800/50 border-zinc-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    效果数据
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="曝光进入率（人数）"
                    value={item.exposureRatePeople !== null ? `${item.exposureRatePeople}%` : '暂无数据'}
                  />
                  <InfoRow
                    icon={<Users className="h-3.5 w-3.5" />}
                    label="曝光进入率（次数）"
                    value={item.exposureRateCount !== null ? `${item.exposureRateCount}%` : '暂无数据'}
                  />
                  <InfoRow
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="周期平均停留时长"
                    value={item.avgStayDuration || '暂无数据'}
                  />
                  <InfoRow
                    icon={<TrendingUp className="h-3.5 w-3.5" />}
                    label="周期平均转粉率"
                    value={item.avgFollowRate || '暂无数据'}
                  />
                </CardContent>
              </Card>

              {/* Evaluation */}
              {item.evaluation && (
                <Card className="bg-zinc-800/50 border-zinc-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      评价
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-200 leading-relaxed">{item.evaluation}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== Info Row Component ========== */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-zinc-500 mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-200 break-words">{value || '-'}</div>
      </div>
    </div>
  );
}
