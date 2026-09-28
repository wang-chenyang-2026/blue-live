import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { liveCookies, type StoredCookie } from '@/lib/buyin-session';
import { persistAccountCookies, resolveCookieFileForAccount, type PersistedCookie } from '@/lib/buyin-cookie-store';

/**
 * 百应采集任务执行器（M3 + 补单）。
 *
 * 职责：
 *  - 解析本次统计日窗口（定时=昨日/回溯 n 天；手动=可选指定单日）
 *  - 从受限持久 cookie 文件载入登录态（扫码后才落盘，见 buyin-cookie-store）；
 *    内存态仅作扫码当下兜底，调度执行一律以持久文件为准
 *  - 真实取数：以子进程调用 skill 采集入口（scripts/dy_by_run.py），注入 PYTHONPATH/NODE_PATH，
 *    cookie 给子进程（不入日志/接口/数据库）；a_bogus 由 skill 每请求现签，不缓存
 *  - 结果如实写 buyin_run_logs：row_count/request_count 用脚本真实输出；11001 等失败记 error_summary
 *  - 防重入：同一任务仍在跑时本轮记为 skipped；重复统计日（已有 success）记为 skipped
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

export const DY_BY_DIR = process.env.DY_BY_DIR || '/workspace/projects/data/dy_by/dy_by';
const RUN_SCRIPT = join(DY_BY_DIR, 'scripts', 'dy_by_run.py');
const PY_LIBS = join(process.env.DY_BY_ROOT || '/workspace/projects/data/dy_by', 'pylibs');
const NODE_MODULES = join(process.env.DY_BY_ROOT || '/workspace/projects/data/dy_by', 'node_modules_root', 'node_modules');

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
  patch: { status: RunStatus; rowCount: number; requestCount: number; errorSummary: string | null; detail: string | null },
): Promise<void> {
  if (!runId) return;
  await getSupabaseClient()
    .from('buyin_run_logs')
    .update({
      status: patch.status,
      row_count: patch.rowCount,
      request_count: patch.requestCount,
      error_summary: patch.errorSummary ? patch.errorSummary.slice(0, 1000) : null,
      detail: patch.detail ? patch.detail.slice(0, 1000) : null,
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
  detail: string | null;
}

export interface RunOptions {
  triggerType: 'auto' | 'manual';
  creatorId?: string | null;
  statDate?: string;
  skipIfSuccess?: boolean;
}

/** 取数签名 SDK 是否随仓库就绪（scripts/by_sign/vendor 存在）。 */
export function signSdkReady(): boolean {
  return existsSync(join(DY_BY_DIR, 'scripts', 'by_sign', 'vendor'));
}

/**
 * 解析本次执行应使用的登录态（持久文件优先，进程内内存兜底并顺手落盘）。
 * 返回 null 表示没有任何可用登录态。
 */
export async function resolveExecutableCookie(task: BuyinRuntimeTask): Promise<PersistedCookie | null> {
  const persisted = resolveCookieFileForAccount(task.by_account || null);
  if (persisted && Object.keys(persisted.cookies).length) return persisted;

  // 无持久文件：用进程内已登录会话兜底，并把其 cookie 立即落盘，之后以持久文件为准
  const sessions = liveCookies();
  if (sessions.length) {
    let match: { accountHint: string | null; cookie: StoredCookie[] | null } | undefined;
    const want = (task.by_account || '').trim();
    if (want) match = sessions.find((s) => s.accountHint && s.accountHint.includes(want.slice(0, 30)));
    else match = sessions[0];
    if (!match) match = sessions[0];
    if (match && match.cookie && match.cookie.length) {
      persistAccountCookies(match.cookie, match.accountHint || task.by_account || null);
      const hit = resolveCookieFileForAccount(match.accountHint || task.by_account || '');
      if (hit) return hit;
    }
  }
  return null;
}

/** 校验持久 cookie 是否具备取数所需的最小集合。 */
function validateCookieCompleteness(pc: PersistedCookie): { ok: boolean; reason: string } {
  const c = pc.cookies || {};
  if (!c.sessionid) return { ok: false, reason: '持久登录态缺少 sessionid，需在百应页重新扫码登录' };
  const missing = ['ecom_us_lt_buyin', 'ecom_us_lt_compass'].filter((k) => !c[k]);
  if (missing.length) return { ok: false, reason: `持久登录态不完整（缺 ${missing.join('/')}），需在百应页重新扫码登录` };
  return { ok: true, reason: '' };
}

interface FetchResult {
  status: 'success' | 'partial' | 'failed';
  rows: number;
  rawDumps: number;
  errors: string[];
  dataDir: string;
  rawDir: string;
}

function runFetchProcess(
  task: BuyinRuntimeTask,
  cookieFile: string,
  dates: string[],
  gran: string[],
): Promise<FetchResult> {
  return new Promise((resolve) => {
    if (!existsSync(RUN_SCRIPT)) {
      resolve({ status: 'failed', rows: 0, rawDumps: 0, errors: ['采集脚本缺失：' + RUN_SCRIPT + '，请安装 skill 运行时资产'], dataDir: '', rawDir: '' });
      return;
    }
    const args = [
      RUN_SCRIPT,
      '--start-date', dates[0],
      '--end-date', dates[dates.length - 1],
      '--data-types', gran.join(','),
      '--cookie-file', cookieFile,
    ];
    if (task.with_product_detail) args.push('--with-product-detail');
    if (task.by_account) args.push('--by-account', task.by_account);
    if (task.by_kol_id) args.push('--by-kol-id', task.by_kol_id);

    const proc = spawn('python3', args, {
      cwd: DY_BY_DIR,
      env: { ...process.env, PYTHONPATH: [PY_LIBS, join(DY_BY_DIR, 'scripts')].filter(Boolean).join(':'), NODE_PATH: NODE_MODULES },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
    }, 20 * 60 * 1000); // 单轮最多 20 分钟
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve({ status: 'failed', rows: 0, rawDumps: 0, errors: [`无法拉起 python3：${sanitizeError(e)}`], dataDir: '', rawDir: '' });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const out = stdout + '\n' + stderr;
      const g = (k: string) => { const m = stdout.match(new RegExp(`^${k}=(.+)$`, 'm')); return m ? m[1].trim() : ''; };
      const dataDir = g('DATA_DIR');
      const rawDir = g('RAW_DIR');
      const parseFiles = Number(g('PARSE_FILES')) || 0;
      const rows = Number(g('ROWS')) || 0;
      const excelFile = g('EXCEL_FILE');
      const failsLine = g('FAILS');
      const errors: string[] = [];
      if (failsLine) errors.push(failsLine.slice(0, 800));
      let rawDumps = 0;
      if (rawDir && existsSync(rawDir)) rawDumps = countJsonRecursive(rawDir);
      // anchor 粒度依赖排班：未注入 shifts 时 skill 不会产出 anchor 行，如实标注
      if (gran.includes('anchor')) errors.push('anchor 粒度依赖排班数据，本次未注入 shifts，故不产出主播行（如实说明，非报错）');
      if (parseFiles === 0 && rows === 0 && code !== 0) {
        if (!errors.length) errors.push(`采集脚本退出码 ${code} 且零输出；stderr: ${sanitizeError(new Error(stderr.slice(0, 300)))}`);
        resolve({ status: 'failed', rows: 0, rawDumps, errors, dataDir, rawDir });
        return;
      }
      if (errors.length && rows > 0) resolve({ status: 'partial', rows, rawDumps, errors, dataDir, rawDir });
      else if (rows > 0) resolve({ status: 'success', rows, rawDumps, errors, dataDir, rawDir });
      else {
        if (!errors.length) errors.push(`采集脚本零输出（exit=${code}），未生成任何行`);
        resolve({ status: 'failed', rows: 0, rawDumps, errors, dataDir, rawDir });
      }
    });
  });
}

function countJsonRecursive(dir: string): number {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += countJsonRecursive(p);
    else if (e.name.endsWith('.json')) n += 1;
  }
  return n;
}

/**
 * 执行一轮采集（进程内）。任务仍在跑 → 记为 skipped；已有 success → 记为 skipped。
 * 结果写库 buyin_run_logs。cookie 不落日志；错误信息经 sanitizeError 脱敏。
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
    return { runId: rid, status: 'skipped', rowCount: 0, requestCount: 0, statDates, errorSummary: '同一任务上一轮仍在运行，本轮跳过', detail: null };
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
    return { runId: rid, status: 'skipped', rowCount: 0, requestCount: 0, statDates, errorSummary: '目标统计日已有成功采集记录，本轮跳过', detail: null };
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

  let outcome: RunOutcome;
  try {
    const pc = await resolveExecutableCookie(task);
    if (!pc) {
      outcome = { runId, status: 'failed', rowCount: 0, requestCount: 0, statDates, errorSummary: '无可用登录态：未找到该账号的持久登录态，请在百应页重新扫码登录', detail: '调度执行以持久 cookie 文件为准；当前无可用登录态，未发起任何真实取数请求' };
    } else if (!validateCookieCompleteness(pc).ok) {
      outcome = { runId, status: 'failed', rowCount: 0, requestCount: 0, statDates, errorSummary: validateCookieCompleteness(pc).reason, detail: '登录态不完整，未发起真实取数请求' };
    } else if (!signSdkReady()) {
      outcome = { runId, status: 'failed', rowCount: 0, requestCount: 0, statDates, errorSummary: '取数签名SDK未就绪（缺 scripts/by_sign/vendor），无法对 /compass_api/author/** 签名，未发起真实取数', detail: null };
    } else {
      const res = await runFetchProcess(task, pc.file, statDates, gran);
      const errText = res.errors.map((s) => sanitizeError(new Error(s))).join('；');
      outcome = {
        runId,
        status: res.status,
        rowCount: res.rows,
        requestCount: res.rawDumps,
        statDates,
        errorSummary: errText || null,
        detail: `DATA_DIR=${res.dataDir}; RAW_DIR=${res.rawDir}; rawDumps=${res.rawDumps}` + (res.errors.length ? `；${errText}` : ''),
      };
    }
  } catch (e) {
    outcome = { runId, status: 'failed', rowCount: 0, requestCount: 0, statDates, errorSummary: sanitizeError(e), detail: null };
  }

  running.delete(task.id);
  await finalizeRunLog(runId, {
    status: outcome.status,
    rowCount: outcome.rowCount,
    requestCount: outcome.requestCount,
    errorSummary: outcome.errorSummary,
    detail: outcome.detail,
  });

  return outcome;
}

function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/(cookie|signature|sig|token)\s*[=:]\s*\S+/gi, '$1=<redacted>').slice(0, 500);
}