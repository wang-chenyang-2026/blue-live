import { BUYIN_FIELDS, type BuyinGranularity } from '@/lib/data/buyin-fields';

const GRANS: BuyinGranularity[] = ['day', 'hour', 'product', 'anchor'];
const FIELD_SET = new Set(BUYIN_FIELDS.map((f) => f.field));

function cleanGrans(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => GRANS.includes(x as BuyinGranularity))));
}

function cleanFields(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && FIELD_SET.has(x))));
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function int(v: unknown, dft: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : dft;
}

function freqOk(v: unknown): string {
  return ['daily', 'weekly', 'custom', 'manual'].includes(v as string) ? (v as string) : 'daily';
}

// 统一的 body 清洗（create 用非 update_only 分支，update 用 update_only 分支）
// 返回 errs 非空表示校验不通过；data 为可写列（不含 name/granularities/selected_fields 的重复键见返回）。
export function cleanTaskBody(body: Record<string, unknown>) {
  const granularities = cleanGrans(body.granularities);
  const selected_fields = cleanFields(body.selected_fields);
  const name = str(body.name, 64);
  const errs: string[] = [];
  if (!name) errs.push('任务名称不能为空');
  if (granularities.length === 0) errs.push('至少选择一个数据粒度');
  if (!body.update_only && selected_fields.length === 0) errs.push('至少选择一个指标字段');

  const data: Record<string, unknown> = {
    by_kol_id: str(body.by_kol_id, 64),
    by_account: str(body.by_account, 128),
    enabled: bool(body.enabled, true),
  };

  if (!body.update_only) {
    Object.assign(data, {
      with_product_detail: bool(body.with_product_detail, false),
      lookback_days: int(body.lookback_days, 1),
      frequency: freqOk(body.frequency),
      interval_days: body.interval_days != null ? int(body.interval_days, 7) : null,
      run_time: str(body.run_time, 10),
      delivery_target_type: body.delivery_target_type === 'auto_create' ? 'auto_create' : 'feishu',
      delivery_feishu_token: str(body.delivery_feishu_token, 512),
      delivery_feishu_url: str(body.delivery_feishu_url, 2048),
      delivery_auto_create: bool(body.delivery_auto_create, false),
      one_sheet_per_type: bool(body.one_sheet_per_type, true),
      write_mode: body.write_mode === 'overwrite' ? 'overwrite' : 'append',
    });
  } else {
    if (body.with_product_detail !== undefined) data.with_product_detail = bool(body.with_product_detail, false);
    if (body.lookback_days !== undefined) data.lookback_days = int(body.lookback_days, 1);
    if (body.frequency !== undefined) data.frequency = freqOk(body.frequency);
    if (body.interval_days !== undefined) data.interval_days = int(body.interval_days, 7);
    if (body.run_time !== undefined) data.run_time = str(body.run_time, 10);
    if (body.delivery_target_type !== undefined) data.delivery_target_type = body.delivery_target_type === 'auto_create' ? 'auto_create' : 'feishu';
    if (body.delivery_feishu_token !== undefined) data.delivery_feishu_token = str(body.delivery_feishu_token, 512);
    if (body.delivery_feishu_url !== undefined) data.delivery_feishu_url = str(body.delivery_feishu_url, 2048);
    if (body.delivery_auto_create !== undefined) data.delivery_auto_create = bool(body.delivery_auto_create, false);
    if (body.one_sheet_per_type !== undefined) data.one_sheet_per_type = bool(body.one_sheet_per_type, true);
    if (body.write_mode !== undefined) data.write_mode = body.write_mode === 'overwrite' ? 'overwrite' : 'append';
    if (body.enabled !== undefined) data.enabled = bool(body.enabled, true);
  }

  return { granularities, selected_fields, name, errs, data };
}