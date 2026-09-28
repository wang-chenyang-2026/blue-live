import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 百应取数结果入库（M4）。
 * - 执行器成功/partial 拿到真实 parse 后，把数据行 upsert 进 buyin_data。
 * - 幂等唯一键 (account_key, stat_date, data_type, dim_key)：重跑同一统计日覆盖更新，不堆叠。
 * - cookie/签名串绝不入库：row_json 只含业务指标字段（skill 产出的英文字段名行）。
 */

// 每行在幂等键中的维标识：day→'day'；hour→统计时段；anchor→主播标识；product→'product'（skill 单日单聚合行）
export function dimKeyForRow(row: Record<string, unknown>): string {
  const dt = String(row?.data_type ?? '');
  if (dt === 'hour') return String(row?.stat_hour ?? '');
  if (dt === 'anchor') return String(row?.anchor_name ?? row?.by_kol_id ?? '');
  if (dt === 'product') return 'product';
  return 'day';
}

function nullIfBlank(v: unknown, max: number): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).slice(0, max);
  return s;
}

export interface PersistTarget {
  taskId?: string | null;
  accountHint?: string | null;
  accountKey?: string | null;
}

/**
 * 读取 parse 目录中指定统计日的真实行，逐行 upsert 入库。
 * 返回实际上库行数与失败数。单个 parse 文件损坏/单行失败不阻断其余。
 */
export async function persistBuyinRows(
  dataDir: string,
  statDates: string[],
  target: PersistTarget,
): Promise<{ count: number; failed: number }> {
  const parseDir = join(dataDir, 'parse');
  if (!existsSync(parseDir)) return { count: 0, failed: 0 };

  const rows: { statDate: string; row: Record<string, unknown> }[] = [];
  for (const date of statDates) {
    const f = join(parseDir, `by_info_${date}.json`);
    if (!existsSync(f)) continue;
    try {
      const arr = JSON.parse(readFileSync(f, 'utf8'));
      if (Array.isArray(arr)) {
        for (const r of arr) if (r && typeof r === 'object') rows.push({ statDate: date, row: r as Record<string, unknown> });
      }
    } catch {
      // 单个 parse 文件损坏：跳过该日，不阻断
    }
  }
  if (!rows.length) return { count: 0, failed: 0 };

  const client = getSupabaseClient();
  let count = 0;
  let failed = 0;
  for (const { statDate, row } of rows) {
    const dataType = String(row?.data_type ?? 'day');
    const liveIds = Array.isArray(row?.live_ids) ? (row.live_ids as unknown[]) : undefined;
    const rec = {
      task_id: target?.taskId ? String(target.taskId).slice(0, 36) : null,
      account_hint: nullIfBlank(target?.accountHint, 128),
      account_key: String(target?.accountKey || '').slice(0, 32),
      stat_date: String(row?.stat_date ?? statDate).slice(0, 10),
      data_type: dataType.slice(0, 16),
      dim_key: dimKeyForRow(row).slice(0, 255),
      live_room_id: liveIds?.length ? String(liveIds[0]).slice(0, 64) : null,
      row_json: row,
      crawl_status: nullIfBlank(row?.crawl_status, 32),
      state_desc: nullIfBlank(row?.state_desc, 255),
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await client.from('buyin_data').upsert(rec, { onConflict: 'account_key,stat_date,data_type,dim_key' });
      if (error) failed += 1;
      else count += 1;
    } catch {
      failed += 1;
    }
  }
  return { count, failed };
}