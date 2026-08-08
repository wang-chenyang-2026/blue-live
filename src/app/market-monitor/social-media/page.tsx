'use client';

import { useState } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Trash2,
  Search,
  Megaphone,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ========== Types ========== */
type TaskStatus = 'running' | 'completed' | 'error';

interface MonitorTask {
  id: string;
  name: string;
  platform: string;
  keywords: string[];
  status: TaskStatus;
  createdAt: string;
  postCount: number;
  progress: number;
}

/* ========== Mock Data ========== */
const MOCK_TASKS: MonitorTask[] = [
  {
    id: '1',
    name: 'vivo X200 新品发布监测',
    platform: '抖音',
    keywords: ['vivo X200', 'vivo新品', 'X200发布会'],
    status: 'running',
    createdAt: '2025-08-01 10:30',
    postCount: 1256,
    progress: 68,
  },
  {
    id: '2',
    name: 'iQOO 13 游戏手机舆情',
    platform: '微博',
    keywords: ['iQOO 13', 'iQOO游戏手机', '电竞手机'],
    status: 'completed',
    createdAt: '2025-07-25 14:20',
    postCount: 3420,
    progress: 100,
  },
  {
    id: '3',
    name: '618大促手机品类监测',
    platform: '小红书',
    keywords: ['618手机', '手机推荐', '购机攻略'],
    status: 'completed',
    createdAt: '2025-06-01 09:00',
    postCount: 8932,
    progress: 100,
  },
  {
    id: '4',
    name: '华为Mate竞品分析',
    platform: '全平台',
    keywords: ['华为Mate', '华为手机', 'Mate系列'],
    status: 'running',
    createdAt: '2025-08-05 16:45',
    postCount: 5678,
    progress: 45,
  },
  {
    id: '5',
    name: '折叠屏手机市场监测',
    platform: '抖音',
    keywords: ['折叠屏', '折叠手机', '翻盖手机'],
    status: 'error',
    createdAt: '2025-07-30 11:15',
    postCount: 234,
    progress: 30,
  },
  {
    id: '6',
    name: '小米15系列用户反馈',
    platform: '微博',
    keywords: ['小米15', 'Xiaomi 15', '小米手机'],
    status: 'completed',
    createdAt: '2025-07-20 08:30',
    postCount: 5634,
    progress: 100,
  },
  {
    id: '7',
    name: 'OPPO Find X8 种草监测',
    platform: '小红书',
    keywords: ['OPPO Find X8', 'OPPO手机', 'Find系列'],
    status: 'running',
    createdAt: '2025-08-03 13:00',
    postCount: 1890,
    progress: 82,
  },
];

const PLATFORMS = ['抖音', '微博', '小红书', 'B站', '全平台'];

/* ========== Status Badge ========== */
function StatusBadge({ status }: { status: TaskStatus }) {
  const configs = {
    running: {
      label: '运行中',
      className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      icon: <Play className="h-3 w-3" />,
    },
    completed: {
      label: '已完成',
      className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    error: {
      label: '异常',
      className: 'bg-red-500/15 text-red-400 border-red-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const cfg = configs[status];
  return (
    <Badge variant="outline" className={cn('gap-1', cfg.className)}>
      {status === 'running' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />}
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

/* ========== Main Component ========== */
export default function SocialMediaPage() {
  const [tasks, setTasks] = useState<MonitorTask[]>(MOCK_TASKS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    platform: '抖音',
    keywords: '',
  });

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.keywords.some((k) => k.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPlatform = platformFilter === 'all' || t.platform === platformFilter;
    return matchesSearch && matchesStatus && matchesPlatform;
  });

  const stats = {
    total: tasks.length,
    running: tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    error: tasks.filter((t) => t.status === 'error').length,
  };

  const handleCreateTask = () => {
    if (!newTask.name.trim()) return;
    const task: MonitorTask = {
      id: Date.now().toString(),
      name: newTask.name,
      platform: newTask.platform,
      keywords: newTask.keywords.split(/[,，]/).map((k) => k.trim()).filter(Boolean),
      status: 'running',
      createdAt: new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\//g, '-'),
      postCount: 0,
      progress: 0,
    };
    setTasks((prev) => [task, ...prev]);
    setNewTask({ name: '', platform: '抖音', keywords: '' });
    setIsCreateDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">总任务数</div>
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">运行中</div>
            <div className="text-2xl font-bold text-emerald-400">{stats.running}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">已完成</div>
            <div className="text-2xl font-bold text-zinc-400">{stats.completed}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground mb-1">异常</div>
            <div className="text-2xl font-bold text-red-400">{stats.error}</div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索任务名称或关键词..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="running">运行中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
                <SelectItem value="error">异常</SelectItem>
              </SelectContent>
            </Select>

            {/* Platform Filter */}
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger size="sm" className="w-28">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex-1" />

            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
            >
              <Plus className="h-4 w-4 mr-1" />
              新建监测任务
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Task Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-primary" />
            监测任务列表
          </CardTitle>
          <CardDescription>
            共 {filteredTasks.length} 个任务
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>任务名称</TableHead>
                  <TableHead>监测平台</TableHead>
                  <TableHead>关键词</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">帖子数</TableHead>
                  <TableHead className="text-right">进度</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium text-foreground">
                      {task.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {task.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {task.keywords.slice(0, 2).map((kw) => (
                          <Badge key={kw} variant="outline" className="text-[10px]">
                            {kw}
                          </Badge>
                        ))}
                        {task.keywords.length > 2 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{task.keywords.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {task.postCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              task.status === 'error'
                                ? 'bg-red-500'
                                : task.status === 'completed'
                                ? 'bg-zinc-500'
                                : 'bg-gradient-to-r from-[#4158D0] to-[#C850C0]',
                            )}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8">
                          {task.progress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.createdAt}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" title="查看详情">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" title="编辑">
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="删除"
                          onClick={() => handleDelete(task.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTasks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      暂无匹配的监测任务
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>新建监测任务</DialogTitle>
            <DialogDescription>
              创建一个新的社媒帖子监测任务，系统将自动采集相关平台数据。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="task-name">任务名称</Label>
              <Input
                id="task-name"
                placeholder="请输入任务名称"
                value={newTask.name}
                onChange={(e) => setNewTask((t) => ({ ...t, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="platform">监测平台</Label>
              <Select
                value={newTask.platform}
                onValueChange={(v) => setNewTask((t) => ({ ...t, platform: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keywords">监测关键词</Label>
              <Input
                id="keywords"
                placeholder="多个关键词用逗号分隔，如：vivo,手机,新品"
                value={newTask.keywords}
                onChange={(e) => setNewTask((t) => ({ ...t, keywords: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                支持多个关键词，使用逗号分隔
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleCreateTask}
              className="bg-gradient-to-r from-[#4158D0] to-[#C850C0] hover:opacity-90"
            >
              创建任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
