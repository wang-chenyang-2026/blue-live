/**
 * 品牌洞察-社媒声量任务的文件型存储
 *
 * 仅存储 common-tools-server 的 voice 系列任务（全网声量），
 * 与 src/lib/social-task-store.ts 中的 media 洞察任务数据隔离。
 *
 * 数据落盘到项目目录下 .brand-voice-tasks.json，按 created_by 隔离。
 */
import { promises as fs } from 'fs';
import path from 'path';

export type BrandTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BrandTaskRecord {
  id: string;
  task_name: string;
  brand_name: string;
  industry: string | null;
  category: string | null;
  // voice 流程
  brief_session_id: number | null;
  biz_no: string | null;
  brief_text: string | null;
  brief_keyword: string | null;
  brief_password: string | null;
  source_codes: string | null;
  content_modes: string | null;
  start_time: string | null;
  end_time: string | null;
  // 状态
  status: BrandTaskStatus;
  mcp_status: number | string | null;
  mcp_status_desc: string | null;
  result_data: unknown | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

const DATA_FILE = path.join(process.cwd(), '.brand-voice-tasks.json');

let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): { tasks: BrandTaskRecord[] } {
  return { tasks: [] };
}

async function readStore(): Promise<{ tasks: BrandTaskRecord[] }> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return emptyStore();
    return parsed;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    console.warn('[brand-task-store] read failed:', err);
    return emptyStore();
  }
}

async function writeStore(data: { tasks: BrandTaskRecord[] }): Promise<void> {
  writeChain = writeChain.then(async () => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  });
  await writeChain;
}

function genUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listTasks(userId: string): Promise<BrandTaskRecord[]> {
  const store = await readStore();
  return store.tasks
    .filter((t) => t.created_by === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function getTaskById(id: string): Promise<BrandTaskRecord | null> {
  const store = await readStore();
  return store.tasks.find((t) => t.id === id) || null;
}

export async function getTaskByBizNo(bizNo: string): Promise<BrandTaskRecord | null> {
  const store = await readStore();
  return store.tasks.find((t) => t.biz_no === bizNo) || null;
}

export async function createTask(
  row: Partial<BrandTaskRecord> &
    Pick<BrandTaskRecord, 'task_name' | 'brand_name' | 'status' | 'created_by'>,
): Promise<BrandTaskRecord> {
  const store = await readStore();
  const now = new Date().toISOString();
  const record: BrandTaskRecord = {
    id: row.id || genUuid(),
    task_name: row.task_name,
    brand_name: row.brand_name,
    industry: row.industry ?? null,
    category: row.category ?? null,
    brief_session_id: row.brief_session_id ?? null,
    biz_no: row.biz_no ?? null,
    brief_text: row.brief_text ?? null,
    brief_keyword: row.brief_keyword ?? null,
    brief_password: row.brief_password ?? null,
    source_codes: row.source_codes ?? null,
    content_modes: row.content_modes ?? null,
    start_time: row.start_time ?? null,
    end_time: row.end_time ?? null,
    status: row.status,
    mcp_status: row.mcp_status ?? null,
    mcp_status_desc: row.mcp_status_desc ?? null,
    result_data: row.result_data ?? null,
    file_url: row.file_url ?? null,
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
    created_by: row.created_by,
  };
  store.tasks.push(record);
  await writeStore(store);
  return record;
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      BrandTaskRecord,
      | 'status'
      | 'mcp_status'
      | 'mcp_status_desc'
      | 'result_data'
      | 'file_url'
      | 'biz_no'
      | 'brief_session_id'
      | 'brief_keyword'
      | 'brief_password'
      | 'source_codes'
      | 'content_modes'
      | 'start_time'
      | 'end_time'
      | 'task_name'
      | 'brand_name'
    >
  >,
): Promise<BrandTaskRecord | null> {
  const store = await readStore();
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  store.tasks[idx] = {
    ...store.tasks[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await writeStore(store);
  return store.tasks[idx];
}

export async function deleteTask(id: string): Promise<boolean> {
  const store = await readStore();
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  store.tasks.splice(idx, 1);
  await writeStore(store);
  return true;
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
