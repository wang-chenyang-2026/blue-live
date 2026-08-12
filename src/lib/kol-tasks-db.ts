/**
 * KOL 选号任务表初始化与访问
 *
 * 表：kol_selection_tasks
 *
 * 如果表尚未创建，ensureKolTasksTable() 会在后端启动 / 首次访问时尝试
 * 通过可用的通道自动建表（exec_sql RPC / pg-meta / pg 直连）。
 * 若所有通道都不可用，将在日志中给出明确提示，需要 DBA 手动执行
 * src/lib/kol-tasks.schema.sql。
 */
import { supabaseAdmin } from './supabase';

export interface KolSelectionTaskRow {
  id: string;
  project_id: number;
  task_name: string;
  product_name: string;
  brand: string | null;
  brief_summary: string | null;
  keyword_groups: unknown;
  metrics: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result_data: unknown | null;
  file_url: string | null;
  mcp_status: number | null;
  mcp_status_desc: string | null;
  created_at: string;
  created_by: string | null;
}

const CREATE_TABLE_SQL = `
create table if not exists public.kol_selection_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id bigint not null unique,
  task_name text not null,
  product_name text not null,
  brand text,
  brief_summary text,
  keyword_groups jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'running',
  result_data jsonb,
  file_url text,
  mcp_status integer,
  mcp_status_desc text,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_kol_selection_tasks_created_at
  on public.kol_selection_tasks (created_at desc);

create index if not exists idx_kol_selection_tasks_created_by
  on public.kol_selection_tasks (created_by);

create index if not exists idx_kol_selection_tasks_status
  on public.kol_selection_tasks (status);
`;

let initPromise: Promise<boolean> | null = null;

async function tryExecViaRpc(sql: string): Promise<boolean> {
  const db = supabaseAdmin();
  const candidates = ['exec_sql', 'execute_sql', 'exec', 'run_sql'];
  for (const fn of candidates) {
    try {
      const { error } = await db.rpc(fn as never, { sql } as never);
      if (!error) {
        console.log(`[kol-tasks] table ensured via rpc.${fn}`);
        return true;
      }
    } catch {
      /* ignore and try next */
    }
  }
  return false;
}

async function tryExecViaPgMeta(sql: string): Promise<boolean> {
  const url = process.env.COZE_SUPABASE_URL;
  const key =
    process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4d3Z5amNwc2hwcmF2ZG9rcmRkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDE3Njk2MywiZXhwIjoyMDk5NzUyOTYzfQ.w2sZE8fyiQ9ckD0TUa21HEJjkT-gb4vOTBTe4jy9vZE';
  if (!url || !key) return false;
  const paths = ['/pg/query', '/pg-meta/query', '/api/pg/query'];
  for (const p of paths) {
    try {
      const res = await fetch(`${url}${p}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          apikey: key,
        },
        body: JSON.stringify({ query: sql }),
        cache: 'no-store' as RequestCache,
      });
      if (res.ok) {
        console.log(`[kol-tasks] table ensured via ${p}`);
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

async function tryExecViaPg(sql: string): Promise<boolean> {
  // 通过 pg 直连（若设置了 DATABASE_URL 或 SUPABASE_DB_URL 等）
  const connStr =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.COZE_SUPABASE_DB_URL ||
    process.env.POSTGRES_URL;
  if (!connStr) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log('[kol-tasks] table ensured via pg direct connection');
    return true;
  } catch (e) {
    console.warn('[kol-tasks] pg direct execute failed:', e);
    return false;
  }
}

async function tableExists(): Promise<boolean> {
  const db = supabaseAdmin();
  try {
    const { error } = await db
      .from('kol_selection_tasks')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * 确保 kol_selection_tasks 表存在。返回是否可用。
 */
export async function ensureKolTasksTable(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (await tableExists()) return true;
    console.warn('[kol-tasks] kol_selection_tasks 表不存在，尝试自动创建...');

    const ok =
      (await tryExecViaRpc(CREATE_TABLE_SQL)) ||
      (await tryExecViaPgMeta(CREATE_TABLE_SQL)) ||
      (await tryExecViaPg(CREATE_TABLE_SQL));

    if (ok) {
      return tableExists();
    }

    console.warn(
      '[kol-tasks] ⚠️  无法自动创建 kol_selection_tasks 表。' +
        '请在 Supabase 控制台手动执行 src/lib/kol-tasks.schema.sql 后重试。',
    );
    return false;
  })();
  return initPromise;
}

/**
 * 从请求中解析当前用户标识（简化版：取 x-user-id / x-user-email 头或默认 anonymous）
 */
export function resolveUserId(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-user-id') ||
    h.get('x-user-email') ||
    h.get('x-forwarded-user') ||
    'anonymous'
  );
}

export async function listKolTasks(userId: string): Promise<KolSelectionTaskRow[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('kol_selection_tasks')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`查询任务失败: ${error.message}`);
  return (data || []) as KolSelectionTaskRow[];
}

export async function createKolTask(
  row: Omit<KolSelectionTaskRow, 'id' | 'created_at' | 'result_data' | 'file_url'> &
    Partial<Pick<KolSelectionTaskRow, 'result_data' | 'file_url'>>,
): Promise<KolSelectionTaskRow> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('kol_selection_tasks')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`创建任务记录失败: ${error.message}`);
  return data as KolSelectionTaskRow;
}

export async function updateKolTask(
  projectId: number,
  patch: Partial<
    Pick<
      KolSelectionTaskRow,
      | 'status'
      | 'result_data'
      | 'file_url'
      | 'mcp_status'
      | 'mcp_status_desc'
    >
  >,
): Promise<KolSelectionTaskRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('kol_selection_tasks')
    .update(patch)
    .eq('project_id', projectId)
    .select('*')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`更新任务失败: ${error.message}`);
  }
  return data as KolSelectionTaskRow;
}

export async function getKolTaskByProjectId(
  projectId: number,
): Promise<KolSelectionTaskRow | null> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from('kol_selection_tasks')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw new Error(`查询任务失败: ${error.message}`);
  return (data as KolSelectionTaskRow | null) ?? null;
}
