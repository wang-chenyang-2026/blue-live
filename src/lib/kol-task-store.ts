/**
 * KOL 选号任务的文件型存储（不依赖 Supabase / 外部数据库）
 *
 * 数据落盘到项目目录下 .kol-tasks.json，按 created_by 隔离。
 * 写操作使用简单的串行锁，避免并发写入冲突。
 */
import { promises as fs } from 'fs';
import path from 'path';

export interface KolTaskRecord {
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
  created_by: string;
}

const DATA_FILE = path.join(process.cwd(), '.kol-tasks.json');

let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): { tasks: KolTaskRecord[] } {
  return { tasks: [] };
}

async function readStore(): Promise<{ tasks: KolTaskRecord[] }> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return emptyStore();
    return parsed;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    console.warn('[kol-task-store] read failed:', err);
    return emptyStore();
  }
}

async function writeStore(data: { tasks: KolTaskRecord[] }): Promise<void> {
  // 串行写入
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  });
  await writeChain;
}

function genUuid(): string {
  // 简易 UUID v4，不依赖 crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listTasks(userId: string): Promise<KolTaskRecord[]> {
  const store = await readStore();
  return store.tasks
    .filter((t) => t.created_by === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getTaskByProjectId(projectId: number): Promise<KolTaskRecord | null> {
  const store = await readStore();
  return store.tasks.find((t) => t.project_id === projectId) || null;
}

export async function createTask(
  row: Omit<KolTaskRecord, 'id' | 'created_at'> & Partial<Pick<KolTaskRecord, 'id' | 'created_at'>>,
): Promise<KolTaskRecord> {
  const store = await readStore();
  const record: KolTaskRecord = {
    id: row.id || genUuid(),
    project_id: row.project_id,
    task_name: row.task_name,
    product_name: row.product_name,
    brand: row.brand ?? null,
    brief_summary: row.brief_summary ?? null,
    keyword_groups: row.keyword_groups ?? [],
    metrics: row.metrics ?? {},
    status: row.status,
    result_data: row.result_data ?? null,
    file_url: row.file_url ?? null,
    mcp_status: row.mcp_status ?? null,
    mcp_status_desc: row.mcp_status_desc ?? null,
    created_at: row.created_at || new Date().toISOString(),
    created_by: row.created_by,
  };
  store.tasks.push(record);
  await writeStore(store);
  return record;
}

export async function updateTask(
  projectId: number,
  patch: Partial<
    Pick<
      KolTaskRecord,
      'status' | 'result_data' | 'file_url' | 'mcp_status' | 'mcp_status_desc'
    >
  >,
): Promise<KolTaskRecord | null> {
  const store = await readStore();
  const idx = store.tasks.findIndex((t) => t.project_id === projectId);
  if (idx < 0) return null;
  store.tasks[idx] = { ...store.tasks[idx], ...patch };
  await writeStore(store);
  return store.tasks[idx];
}

export function resolveUserId(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-user-id') ||
    h.get('x-user-email') ||
    h.get('x-forwarded-user') ||
    'anonymous'
  );
}
