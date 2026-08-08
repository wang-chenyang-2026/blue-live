'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Bot,
  User,
  Activity,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MessageSquare,
  BarChart3,
  Users,
  Tag,
  Eye,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ========== Types ========== */
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  dataType?: string;
  data?: unknown;
  service?: string;
  tool?: string;
}

interface CategoryNode {
  name: string;
  children?: CategoryNode[];
}

interface QuickAction {
  label: string;
  message: string;
  icon: React.ReactNode;
  category?: string[];
}

/* ========== Quick Actions ========== */
const QUICK_ACTIONS: QuickAction[] = [
  { label: '大盘趋势', message: '查看手机类目大盘趋势', icon: <TrendingUp className="h-4 w-4" />, category: ['手机'] },
  { label: '品牌排行', message: '查看手机类目品牌销售排行', icon: <BarChart3 className="h-4 w-4" />, category: ['手机'] },
  { label: '销售价量', message: '查看手机类目销售价量数据', icon: <BarChart3 className="h-4 w-4" />, category: ['手机'] },
  { label: '店铺列表', message: '查看手机类目店铺列表', icon: <Users className="h-4 w-4" />, category: ['手机'] },
  { label: '价格区间', message: '查看手机类目价格区间分析', icon: <Tag className="h-4 w-4" />, category: ['手机'] },
  { label: '热词频次', message: '查看手机类目搜索热词频次', icon: <Eye className="h-4 w-4" />, category: ['手机'] },
  { label: '新媒体监测', message: '创建手机市场新媒体舆情监测任务', icon: <Activity className="h-4 w-4" /> },
  { label: '抖音达人KOL', message: '查询手机类目抖音达人KOL数据', icon: <Users className="h-4 w-4" /> },
  { label: '社媒洞察', message: '生成手机市场社媒洞察简报', icon: <Sparkles className="h-4 w-4" /> },
];

const SERVICE_LABELS: Record<string, string> = {
  'crawler-server': '电商数据',
  'new-media-monitoring': '新媒体监测',
  'douyin-kol-api-service': '抖音KOL',
  'dim-server': '标签维表',
  'common-tools-server': '社媒洞察',
};

/* ========== Category Tree Component ========== */
function CategoryTree({
  node,
  depth,
  selected,
  onSelect,
  expanded,
  onToggle,
}: {
  node: CategoryNode;
  depth: number;
  selected: string[];
  onSelect: (path: string[]) => void;
  expanded: Set<string>;
  onToggle: (name: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.name);
  const isSelected = selected[selected.length - 1] === node.name || selected.includes(node.name);

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) onToggle(node.name);
          else onSelect([...selected.filter((_, i) => i < depth), node.name]);
        }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent',
          isSelected ? 'bg-primary/15 text-primary font-medium' : 'text-muted-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="h-3 w-3 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <CategoryTree
              key={child.name}
              node={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== Chat Bubble Component ========== */
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={cn('flex gap-3 mb-4', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/20' : 'bg-emerald-500/20',
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-emerald-400" />
        )}
      </div>

      {/* Content */}
      <div className={cn('max-w-[75%] space-y-1', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-card border border-border rounded-tl-sm',
          )}
        >
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        </div>

        {/* Meta info */}
        <div className={cn('flex items-center gap-2 text-[10px] text-muted-foreground', isUser && 'flex-row-reverse')}>
          <span>{timeStr}</span>
          {message.service && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {SERVICE_LABELS[message.service] || message.service}
            </Badge>
          )}
          {message.tool && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {message.tool}
            </Badge>
          )}
          {!isUser && (
            <button
              onClick={handleCopy}
              className="hover:text-foreground transition-colors"
              title="复制"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Data preview for assistant messages */}
        {!isUser && message.data && typeof message.data === 'object' && (
          <div className="mt-1 rounded-lg border border-border bg-secondary/50 p-3 max-h-64 overflow-auto">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
              {JSON.stringify(message.data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== Main Component ========== */
export default function MarketMonitorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryNode | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string[]>(['手机']);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load categories on mount
  useEffect(() => {
    fetch('/api/market-monitor/categories')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setCategories(res.data as CategoryNode);
          // Auto-expand first level
          if (res.data.children) {
            const expanded = new Set<string>();
            res.data.children.forEach((c: CategoryNode) => expanded.add(c.name));
            setExpandedCats(expanded);
          }
        } else {
          // Fallback default category tree
          setCategories({
            name: '全部品类',
            children: [
              { name: '手机', children: [{ name: '智能手机' }, { name: '功能手机' }] },
              { name: '数码产品', children: [{ name: '手机电脑', children: [{ name: '手机' }] }] },
              { name: '家用电器' },
              { name: '电脑办公' },
            ],
          });
        }
      })
      .catch(() => {
        setCategories({
          name: '全部品类',
          children: [{ name: '手机' }, { name: '数码产品' }, { name: '家用电器' }],
        });
      });

    // Welcome message
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          '你好！我是市场监测助手，已对接5大数据服务：\n\n 电商数据（久谦）- 大盘趋势、品牌排行、价格分析等8种数据视角\n📱 新媒体监测 - 全网舆情监控\n 抖音KOL - 达人数据分析\n🏷️ 标签维表 - 品类标签匹配\n📝 社媒洞察 - 社媒简报生成\n\n你可以直接输入自然语言查询，或点击左侧品类和下方快捷操作开始。',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (msg?: string) => {
      const text = (msg || input).trim();
      if (!text || loading) return;

      setInput('');
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      try {
        const res = await fetch('/api/market-monitor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            category: selectedCategory,
          }),
        });
        const json = await res.json();

        if (json.success) {
          const assistantMsg: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: json.data.reply,
            timestamp: Date.now(),
            dataType: json.data.dataType,
            data: json.data.data,
            service: json.data.service,
            tool: json.data.tool,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: `❌ ${json.error || '请求失败'}`,
              timestamp: Date.now(),
            },
          ]);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `❌ 网络错误：${err instanceof Error ? err.message : '未知错误'}`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, selectedCategory],
  );

  const handleQuickAction = (action: QuickAction) => {
    setSelectedCategory(action.category || selectedCategory);
    handleSend(action.message);
  };

  const toggleCategory = (name: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-0 -m-6">
      {/* ===== Left Panel: Category Tree ===== */}
      <div
        className={cn(
          'flex flex-col border-r border-border bg-sidebar transition-all duration-300',
          leftPanelOpen ? 'w-56' : 'w-0 overflow-hidden',
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            品类选择
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setLeftPanelOpen(false)} className="h-6 w-6 p-0">
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          {categories ? (
            <CategoryTree
              node={categories}
              depth={0}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
              expanded={expandedCats}
              onToggle={toggleCategory}
            />
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </ScrollArea>

        {/* Selected category path */}
        <div className="border-t border-border p-3">
          <p className="text-[10px] text-muted-foreground mb-1">当前品类路径</p>
          <div className="flex flex-wrap gap-1">
            {selectedCategory.map((cat, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Center: Chat Area ===== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            {!leftPanelOpen && (
              <Button variant="ghost" size="sm" onClick={() => setLeftPanelOpen(true)} className="h-6 w-6 p-0">
                <ChevronRight className="h-3 w-3 rotate-180" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">市场监测</h2>
            </div>
            <Badge variant="outline" className="text-[10px]">
              5个MCP服务已连接
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMessages([
                {
                  id: 'welcome',
                  role: 'assistant',
                  content: '会话已清空。输入你的问题开始市场监测。',
                  timestamp: Date.now(),
                },
              ]);
            }}
            className="text-xs text-muted-foreground"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            清空
          </Button>
        </div>

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="max-w-3xl mx-auto">
            {messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))}
            {loading && (
              <div className="flex gap-3 mb-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                  <Bot className="h-4 w-4 text-emerald-400" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">正在查询数据...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-4">
          <div className="max-w-3xl mx-auto">
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action)}
                  disabled={loading}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50',
                  )}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入市场监测问题，如：查看手机类目品牌排行..."
                disabled={loading}
                className="flex-1 bg-secondary border-border text-sm"
              />
              <Button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="gap-1.5"
              >
                <Send className="h-4 w-4" />
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== Right Panel: Quick Info ===== */}
      <div className="flex w-56 flex-col border-l border-border bg-sidebar">
        <div className="flex h-12 items-center border-b border-border px-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            服务状态
          </h3>
        </div>

        <ScrollArea className="flex-1 p-3">
          {/* Service Status */}
          <div className="space-y-2 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">MCP 服务</p>
            {Object.entries(SERVICE_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-xs text-zinc-300">{label}</span>
              </div>
            ))}
          </div>

          {/* Data Views */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">数据视角</p>
            {['大盘趋势', '销售价量', '品牌列表', '店铺列表', '商品列表', '价格区间', '价格交叉', '热词频次'].map(
              (view) => (
                <button
                  key={view}
                  onClick={() => handleSend(`查看${selectedCategory.join(' > ')}的${view}`)}
                  disabled={loading}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  <BarChart3 className="h-3 w-3" />
                  {view}
                </button>
              ),
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border p-3">
          <p className="text-[10px] text-muted-foreground text-center">
            数据来源：分析能力中台
          </p>
          <p className="text-[10px] text-muted-foreground text-center mt-0.5">
            5大MCP服务 · 8种数据视角
          </p>
        </div>
      </div>
    </div>
  );
}
