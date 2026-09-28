import { getSupabaseClient } from '@/storage/database/supabase-client';
import { computeStatDates, hasSuccessForStatDates, isTaskRunning, runTask, type BuyinRuntimeTask } from '@/lib/buyin-runner';

/**
 * 百应采集任务调度器（M3）。
 * - 只处理 enabled=true 的任务，按六态频率计算下次执行时间：
 *   minute：每 interval 分钟；hour：每 interval 小时；daily：每天 run_time；
 *   weekly：每 weekday 的 run_time；custom：每 interval 天的 run_time；manual：不自动触发（返回 null）。
 * - 进程内轮询 tick：到点 dispatch，同一任务在跑则跳过并记录 skipped；同统计日已有 success 则跳过。
 */

export interface ScheduleInputTask {
  id: string;
  frequency?: string;
  /** 已解析的间隔数值（由 interval_value ?? interval_days 投影而来） */
  interval?: number | null;
  weekday?: number | null;
  run_time?: string | null;
  lookback_days?: number;
  granularities?: string[];
  by_account?: string | null;
  enabled?: boolean;
}

function num(v: unknown, dft: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : dft;
}

function hhmm(runTime?: string | null): [number, number] {
  const t = runTime || '00:00';
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (!m) return [0, 0];
  return [Math.min(23, Math.max(0, +m[1])), +m[2]];
}

function nextOnDate(after: Date, runTime: string | undefined | null, dayOffset: number): Date {
  const [h, m] = hhmm(runTime);
  return new Date(after.getFullYear(), after.getMonth(), after.getDate() + dayOffset, h, m, 0, 0);
}

/** 计算任务在 after 之后下一次应执行的时间；manual 或未知频率返回 null（不自动触发）。 */
export function computeNextRun(task: ScheduleInputTask, after: Date): Date | null {
  const freq = task.frequency || 'daily';
  switch (freq) {
    case 'minute': {
      const iv = Math.max(1, num(task.interval, 15));
      return new Date(after.getTime() + iv * 60000);
    }
    case 'hour': {
      const iv = Math.max(1, num(task.interval, 1));
      return new Date(after.getTime() + iv * 3600000);
    }
    case 'daily': {
      const t = nextOnDate(after, task.run_time, 0);
      return t.getTime() > after.getTime() ? t : nextOnDate(after, task.run_time, 1);
    }
    case 'custom': {
      const iv = Math.max(1, num(task.interval, 7));
      const t = nextOnDate(after, task.run_time, 0);
      return t.getTime() > after.getTime() ? t : nextOnDate(after, task.run_time, iv);
    }
    case 'weekly': {
      const target = Math.min(7, Math.max(1, num(task.weekday, 1)));
      let wd = after.getDay();
      if (wd === 0) wd = 7; // 归一化到 1(周一)..7(周日)
      const diff = (target - wd + 7) % 7;
      const t = nextOnDate(after, task.run_time, 0);
      if (diff === 0) return t.getTime() > after.getTime() ? t : nextOnDate(after, task.run_time, 7);
      return nextOnDate(after, task.run_time, diff);
    }
    default:
      return null; // manual 及未识别频率
  }
}

function toRuntimeTask(row: Record<string, unknown>): BuyinRuntimeTask {
  return {
    id: String(row.id),
    by_kol_id: (row.by_kol_id as string) ?? null,
    by_account: (row.by_account as string) ?? null,
    granularities: Array.isArray(row.granularities) ? (row.granularities as string[]) : [],
    selected_fields: Array.isArray(row.selected_fields) ? (row.selected_fields as string[]) : [],
    with_product_detail: Boolean(row.with_product_detail),
    lookback_days: Number(row.lookback_days) || 1,
    frequency: String(row.frequency || 'daily'),
    interval: (row.interval_value as number) ?? (row.interval_days as number),
    weekday: Number(row.weekday) || 1,
    run_time: (row.run_time as string) ?? null,
    enabled: Boolean(row.enabled),
  };
}

async function listEnabledTasks(): Promise<BuyinRuntimeTask[]> {
  const SELECT = ['id', 'by_kol_id', 'by_account', 'granularities', 'selected_fields', 'with_product_detail', 'lookback_days', 'frequency', 'interval_value', 'interval_days', 'weekday', 'run_time', 'enabled'].join(',');
  const { data, error } = await getSupabaseClient().from('buyin_tasks').select(SELECT).eq('enabled', true);
  if (error) return [];
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  return rows.map(toRuntimeTask);
}

export class BuyinScheduler {
  private timer: NodeJS.Timeout | null = null;
  private cursors = new Map<string, Date | null>();
  private disposed = false;

  start(pollMs = 30000): void {
    if (this.timer) return;
    void this.tick(Date.now());
    this.timer = setInterval(() => {
      if (!this.disposed) void this.tick(Date.now());
    }, pollMs);
    this.timer.unref?.();
    console.log('[buyin-scheduler] 调度器已启动（poll 每 %dms）', pollMs);
  }

  stop(): void {
    this.disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ensureCursor(t: BuyinRuntimeTask, now: number): Date | null {
    if (this.cursors.has(t.id)) return this.cursors.get(t.id) ?? null;
    const next = computeNextRun(t, new Date(now));
    this.cursors.set(t.id, next);
    return next;
  }

  async tick(nowMs: number): Promise<void> {
    let tasks: BuyinRuntimeTask[] = [];
    try {
      tasks = await listEnabledTasks();
    } catch {
      return;
    }
    for (const t of tasks) {
      const next = this.ensureCursor(t, nowMs);
      if (!next) continue;
      if (nowMs >= next.getTime()) {
        void this.launch(t, nowMs);
        this.cursors.set(t.id, computeNextRun(t, new Date(nowMs)));
      }
    }
  }

  private async launch(t: BuyinRuntimeTask, nowMs: number): Promise<void> {
    if (isTaskRunning(t.id)) {
      await runTask(t, { triggerType: 'auto', skipIfSuccess: true });
      return;
    }
    // 同统计日已有成功 → 由 runTask 的 skipIfSuccess 记录 skipped
    const dates = computeStatDates({ lookbackDays: t.lookback_days ?? 1 });
    const done = await hasSuccessForStatDates(t.id, dates).catch(() => false);
    if (done) {
      await runTask(t, { triggerType: 'auto', skipIfSuccess: true });
      return;
    }
    await runTask(t, { triggerType: 'auto', skipIfSuccess: true }).catch(() => undefined);
  }
}

let singleton: BuyinScheduler | null = null;

/** 启动全局调度器（幂等）。 */
export function startBuyinScheduler(pollMs?: number): BuyinScheduler {
  if (!singleton) singleton = new BuyinScheduler();
  singleton.start(pollMs);
  return singleton;
}

export function getBuyinScheduler(): BuyinScheduler | null {
  return singleton;
}