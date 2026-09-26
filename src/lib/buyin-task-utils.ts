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

const FREQS = ['minute', 'hour', 'daily', 'weekly', 'custom', 'manual'] as const;
type Freq = (typeof FREQS)[number];
function freqOk(v: unknown): Freq {
  return FREQS.includes(v as Freq) ? (v as Freq) : 'daily';
}

// 各频率的间隔数值范围与默认值；daily/weekly/manual 无间隔。
const INTERVAL_DEF: Record<Freq, number | null> = { minute: 15, hour: 1, daily: null, weekly: null, custom: 7, manual: null };
const INTERVAL_MIN: Record<Freq, number | null> = { minute: 5, hour: 1, daily: null, weekly: null, custom: 1, manual: null };
const INTERVAL_MAX: Record<Freq, number | null> = { minute: 1440, hour: 23, daily: null, weekly: null, custom: 365, manual: null };

// 校验频率间隔；非法返回值绝对落在 [范围] 之外；合法返回 null。
function intervalErr(freq: Freq, v: unknown): string | null {
  const min = INTERVAL_MIN[freq];
  const max = INTERVAL_MAX[freq];
  if (min == null) return null; // daily/weekly/manual 无间隔，不校验
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || Math.floor(n) !== n) return '间隔需要为整数';
  if (n < min) return freq === 'minute' ? '分钟级间隔至少 5 分钟' : freq === 'hour' ? '小时级间隔最小 1 小时' : '自定义间隔至少 1 天';
  if (max != null && n > max) return freq === 'hour' ? '小时级间隔不能超过 23 小时' : '间隔超过最大限制';
  return null;
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

  // 频率 + 间隔联动：minute/hour/custom 需要间隔并校验；daily/weekly/manual 无间隔。
  function applyFreqAndInterval(target: Record<string, unknown>) {
    const freq = freqOk(body.frequency);
    const rawInt = body.interval_value != null ? body.interval_value : body.interval_days != null ? body.interval_days : INTERVAL_DEF[freq];
    const e = intervalErr(freq, rawInt);
    if (e) errs.push(e);
    target.frequency = freq;
    if (INTERVAL_MIN[freq] != null) {
      const val = e ? null : Math.floor(Number(rawInt));
      target.interval_value = val;
      target.interval_days = val; // 兼容旧 reader 读取 interval_days
    } else {
      target.interval_value = null;
      target.interval_days = null;
    }
    const w = int(body.weekday, 1);
    target.weekday = w < 1 ? 1 : w > 7 ? 7 : w;
  }

  if (!body.update_only) {
    Object.assign(data, {
      with_product_detail: bool(body.with_product_detail, false),
      lookback_days: int(body.lookback_days, 1),
      run_time: str(body.run_time, 10),
      delivery_target_type: body.delivery_target_type === 'auto_create' ? 'auto_create' : 'feishu',
      delivery_feishu_token: str(body.delivery_feishu_token, 512),
      delivery_feishu_url: str(body.delivery_feishu_url, 2048),
      delivery_auto_create: bool(body.delivery_auto_create, false),
      one_sheet_per_type: bool(body.one_sheet_per_type, true),
      write_mode: body.write_mode === 'overwrite' ? 'overwrite' : 'append',
    });
    applyFreqAndInterval(data);
  } else {
    if (body.with_product_detail !== undefined) data.with_product_detail = bool(body.with_product_detail, false);
    if (body.lookback_days !== undefined) data.lookback_days = int(body.lookback_days, 1);
    if (body.run_time !== undefined) data.run_time = str(body.run_time, 10);
    if (body.delivery_target_type !== undefined) data.delivery_target_type = body.delivery_target_type === 'auto_create' ? 'auto_create' : 'feishu';
    if (body.delivery_feishu_token !== undefined) data.delivery_feishu_token = str(body.delivery_feishu_token, 512);
    if (body.delivery_feishu_url !== undefined) data.delivery_feishu_url = str(body.delivery_feishu_url, 2048);
    if (body.delivery_auto_create !== undefined) data.delivery_auto_create = bool(body.delivery_auto_create, false);
    if (body.one_sheet_per_type !== undefined) data.one_sheet_per_type = bool(body.one_sheet_per_type, true);
    if (body.write_mode !== undefined) data.write_mode = body.write_mode === 'overwrite' ? 'overwrite' : 'append';
    if (body.enabled !== undefined) data.enabled = bool(body.enabled, true);
    if (body.frequency !== undefined || body.interval_value !== undefined || body.interval_days !== undefined) applyFreqAndInterval(data);
    if (body.weekday !== undefined) {
      const w = int(body.weekday, 1);
      data.weekday = w < 1 ? 1 : w > 7 ? 7 : w;
    }
  }

  return { granularities, selected_fields, name, errs, data };
}