import { existsSync } from 'fs';
import { join } from 'path';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { liveCookies, type StoredCookie } from '@/lib/buyin-session';

/**
 * 百应采集任务执行器（M3）。
 *
 * 职责：
 *  - 解析本次统计日窗口（定时=昨日/回溯 n 天；手动=可选指定单日）
 *  - 定位服务端已保存登录态（进程内存，见 buyin-session），cookie 不回显、不入库
 *  - 能力门控：无登录态 / 取数签名 SDK 缺失时，如实记为 failed 并写明原因，绝不伪造行数
 *  - 防重入：同一任务仍在跑时本轮记为 skipped；重复统计日（已有 success）记为 skipped
 *
 * 说明：取数脚本（skill 原版 dy_by_run + a_bogus 官方 SDK scripts/by_sign/vendor/*.js）
 * 当前未随仓库就绪；门控将其如实归为"未就绪"，避免对 /compass_api/** 发出无签名/无凭证请求。
 * 后续并入 SDK 与真实登录态后，在 collectStatDays 处接入逐日取数（含 11001 退避重试）。
 */

export interface BuyinRuntimeTask {
  id: string;
  by_kol_id?: string | null;
  by_account?: string | null;
  granularities?: string[];
  selected_fields?: string[];
  with_product_detail?: boolean;
  lookback_days?: number;
  frequency?: string;
  interval?: number | null;
  weekday?: number | null;
  run_time?: string | null;
  enabled?: boolean;
}

export type RunStatus = 'running' | 'success' | 'partial' | 'failed' | 'skipped';

const DAY_MS = 86400000;
const SIGN_SDK_DIR = join(process.cwd(), 'scripts', 'by_sign', 'vendor');

// 进程内防重入（同一任务同时只允许一轮执行）
const running = new Set<string>();

export function isTaskRunning(taskId: string): boolean {
  return running.has(taskId);
}

export function resetRunning(): void {
  running.clear();
}

function validateDateStr(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** 本次统计日窗口：默认 [今日-lookback, 今日-1]（含昨日）；手动可指定单日。 */
export function computeStatDates(opts: { lookbackDays?: number; statDate?: string }): string[] {
  if (validateDateStr(opts.statDate)) return [opts.statDate];

  const n = Number.isFinite(opts.lookbackDays) && (opts.lookbackDays as number) >= 1 ? Math.floor(opts.lookbackDays as number) : 1;
  const base = new Date();
  const dates: string[] = [];
  for (let i = 1; i <= n; i++) dates.push(new Date(base.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  return dates;
}

/** 目标统计日是否已有 success 记录（去重：不重复刷同一统计日）。 */
export async function hasSuccessForStatDates(taskId: string, statDates: string[]): Promise<boolean> {
  if (!statDates.length) return false;
  try {
    const { data } = await getSupabaseClient()
      .from('buyin_run_logs')
      .select('stat_dates')
      .eq('task_id', taskId)
      .eq('status', 'success');
    if (!data) return false;
    const done = new Set<string>();
    for (const row of data) {
      if (Array.isArray(row?.stat_dates)) (row.stat_dates as string[]).forEach((d) => done.add(d));
    }
    return statDates.some((d) => done.has(d));
  } catch {
    return false;
  }
}

interface InsertLog {
  task_id: string;
  account_hint: string | null;
  trigger_type: 'auto' | 'manual';
  stat_dates: string[];
  granularities: string[];
  status: RunStatus;
  creator_id: string | null;
  row_count?: number;
  request_count?: number;
  error_summary?: string | null;
  detail?: string | null;
  started_at?: string;
  finished_at?: string;
}

async function insertRunLog(row: InsertLog): Promise<string> {
  try {
    const { data } = await getSupabaseClient().from('buyin_run_logs').insert(row).select('id').single();
    return data?.id ?? '';
  } catch {
    return '';
  }
}

async function finalizeRunLog(
  runId: string,
  patch: { status: RunStatus; rowCount: number; requestCount: number; errorSummary: string | null; days: string[] },
): Promise<void> {
  if (!runId) return;
  await getSupabaseClient()
    .from('buyin_run_logs')
    .update({
      status: patch.status,
      row_count: patch.rowCount,
      request_count: patch.requestCount,
      error_summary: patch.errorSummary ? patch.errorSummary.slice(0, 1000) : null,
      detail: patch.status === 'success' ? '采集完成' : patch.errorSummary ? patch.errorSummary.slice(0, 1000) : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

export interface RunOutcome {
  runId: string;
  status: RunStatus;
  rowCount: number;
  requestCount: number;
  statDates: string[];
  errorSummary: string | null;
}

export interface RunOptions {
  triggerType: 'auto' | 'manual';
  creatorId?: string | null;
  statDate?: string;
  skipIfSuccess?: boolean;
}

/** 登录态是否可用（进程内存，仅进程内使用）。 */
export async function resolveExecutableCookie(task: BuyinRuntimeTask): Promise<{
  cookie: StoredCookie[] | null;
}> {
  const sessions = liveCookies();
  if (!sessions.length) return { cookie: null };
  const want = task.by_account || null;
  if (want) {
    const hit = sessions.find((s) => s.accountHint && s.accountHint.includes(want.slice(0, 30)));
    if (hit && hit.cookie) return { cookie: hit.cookie };
  }
  return { cookie: sessions[0].cookie };
}

/** 取数签名 SDK（scripts/by_sign/vendor）是否随仓库就绪。 */
export function signSdkReady(): boolean {
  return existsSync(SIGN_SDK_DIR);
}

/**
 * 执行一轮采集（进程内，杜绝伪造）。任务仍在跑 → 记为 skipped；已有 success → 记为 skipped。
 * 结果写库 buyin_run_logs。
 */
export async function runTask(task: BuyinRuntimeTask, opts: RunOptions): Promise<RunOutcome> {
  const statDates = computeStatDates({ lookbackDays: task.lookback_days ?? 1, statDate: opts.statDate });
  const gran = Array.isArray(task.granularities) && task.granularities.length ? task.granularities : ['day'];
  const accountHint = (task.by_account || '').slice(0, 128) || null;

  if (running.has(task.id)) {
    const rid = await insertRunLog({
      task_id: task.id,
      account_hint: accountHint,
      trigger_type: opts.triggerType,
      stat_dates: statDates,
      granularities: gran,
      status: 'skipped',
      creator_id: opts.creatorId ?? null,
      error_summary: '同一任务上一轮仍在运行，本轮跳过',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    return { runId: rid, status: 'skipped', rowCount: 0, requestCount: 0, statDates, errorSummary: '同一任务上一轮仍在运行，本轮跳过' };
  }
  if (opts.skipIfSuccess && (await hasSuccessForStatDates(task.id, statDates))) {
    const rid = await insertRunLog({
      task_id: task.id,
      account_hint: accountHint,
      trigger_type: opts.triggerType,
      stat_dates: statDates,
      granularities: gran,
      status: 'skipped',
      creator_id: opts.creatorId ?? null,
      error_summary: '目标统计日已有成功采集记录，本轮跳过',
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    });
    return { runId: rid, status: 'skipped', rowCount: 0, requestCount: 0, statDates, errorSummary: '目标统计日已有成功采集记录，本轮跳过' };
  }

  running.add(task.id);
  const now = new Date().toISOString();
  const runId = await insertRunLog({
    task_id: task.id,
    account_hint: accountHint,
    trigger_type: opts.triggerType,
    stat_dates: statDates,
    granularities: gran,
    status: 'running',
    creator_id: opts.creatorId ?? null,
    started_at: now,
  });

  let status: RunStatus = 'success';
  const errors: string[] = [];
  const rowCount = 0;
  const requestCount = 0;

  try {
    const { cookie } = await resolveExecutableCookie(task);
    if (!cookie || cookie.length === 0) {
      status = 'failed';
      errors.push('无可用登录态：请先在页面「连接百应」扫码登录后再执行。');
    } else if (!signSdkReady()) {
      status = 'failed';
      errors.push('取数签名SDK未随仓库就绪（缺 scripts/by_sign/vendor，官方 a_bogus 原文件未迁入），无法请求 /compass_api/author/**，本轮未发起任何真实取数请求。');
    } else {
      // 真实取数入口：SDK+登录态就绪后在此接入逐日串行取数与 11001 退避重试。
      // 当前二者未齐备时绝不进入，避免无签名/无凭证空请求；也绝不伪造行数。
      status = 'failed';
      errors.push('取数执行器尚未接入（需官方 a_bogus SDK 与有效登录态），已停止于能力门控，未伪造任何数据。');
    }
  } catch (e) {
    status = 'failed';
    errors.push(sanitizeError(e));
  }

  running.delete(task.id);
  await finalizeRunLog(runId, {
    status,
    rowCount,
    requestCount,
    errorSummary: errors.length ? errors.join('；') : null,
    days: statDates,
  });

  return { runId, status, rowCount, requestCount, statDates, errorSummary: errors.join('；') || null };
}

function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/(cookie|signature|sig|token)\s*[=:]\s*\S+/gi, '$1=<redacted>').slice(0, 500);
}