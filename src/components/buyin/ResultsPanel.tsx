'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { FIELD_CN } from '@/lib/field-cn';

interface TaskOpt {
  id: string;
  name: string;
  selected_fields?: string[];
  granularities?: string[];
  by_account?: string | null;
}

interface DataRow {
  id: string;
  task_id: string | null;
  account_hint: string | null;
  stat_date: string;
  data_type: string;
  dim_key: string;
  live_room_id: string | null;
  row_json: Record<string, unknown>;
  crawl_status: string | null;
}

const GRANULARITIES: { key: string; label: string }[] = [
  { key: 'day', label: '每日' },
  { key: 'hour', label: '分时' },
  { key: 'anchor', label: '主播' },
  { key: 'product', label: '商品' },
];

const TYPE_FIELDS: Record<string, string[]> = {
  day: ['stat_date', 'live_sale_amount', 'phone_settle_num', 'live_watch_uv', 'exposure_pv', 'avg_online_count', 'live_duration', 'gpm', 'live_fans_add'],
  hour: ['stat_date', 'stat_hour', 'live_sale_amount', 'phone_sale_num', 'live_watch_uv', 'exposure_uv'],
  anchor: ['stat_date', 'anchor_name', 'live_sale_amount', 'phone_sale_num', 'live_watch_uv', 'live_duration_hour'],
  product: ['stat_date', 'live_sale_amount', 'phone_sale_num', 'model_sale_list', 'product_list'],
};

function fmt(v: unknown, field: string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const isAmount = /_amount$|_price$|amount$|upload$/.test(field);
  const isRate = /rate|percentage|gpm/.test(field);
  if (isRate) return `${n.toFixed(2)}%`;
  if (isAmount) return `¥${n.toLocaleString('zh-CN')}`;
  if (Number.isInteger(n)) return n.toLocaleString('zh-CN');
  return n.toFixed(2);
}

function labelOf(field: string): string {
  return FIELD_CN[field] || field;
}

export default function ResultsPanel() {
  const [tasks, setTasks] = useState<TaskOpt[]>([]);
  const [taskId, setTaskId] = useState<string>('__all__');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [granularity, setGranularity] = useState('day');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    fetch('/api/buyin-spike/tasks')
      .then((r) => r.json())
      .then((d: { success: boolean; tasks?: TaskOpt[] }) => {
        if (d.success && Array.isArray(d.tasks)) setTasks(d.tasks);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (taskId !== '__all__') p.set('taskId', taskId);
      if (startDate) p.set('startDate', startDate);
      if (endDate) p.set('endDate', endDate);
      const d = (await (await fetch(`/api/buyin-spike/data?${p.toString()}`)).json()) as { success: boolean; rows?: DataRow[] };
      setRows(d.success ? (d.rows ?? []) : []);
      setTouched(true);
    } finally {
      setLoading(false);
    }
  }, [taskId, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayRows = useMemo(() => rows.filter((r) => r.data_type === 'day'), [rows]);
  const granularRows = useMemo(() => rows.filter((r) => r.data_type === granularity), [rows, granularity]);

  const overview = useMemo(() => {
    let gmv = 0;
    let pieces = 0;
    let views = 0;
    let fans = 0;
    for (const r of dayRows) {
      const j = r.row_json;
      gmv += Number(j?.live_sale_amount) || 0;
      pieces += Number(j?.phone_settle_num) || 0;
      views += Number(j?.live_watch_uv) || 0;
      fans += Number(j?.live_fans_add) || 0;
    }
    return { gmv, pieces, views, fans };
  }, [dayRows]);

  const trend = useMemo(() => {
    const map = new Map<string, { date: string; gmv: number; views: number }>();
    for (const r of dayRows) {
      const cur = map.get(r.stat_date) || { date: r.stat_date, gmv: 0, views: 0 };
      cur.gmv += Number(r.row_json?.live_sale_amount) || 0;
      cur.views += Number(r.row_json?.live_watch_uv) || 0;
      map.set(r.stat_date, cur);
    }
    return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [dayRows]);

  const selectedFields = useMemo(() => {
    const t = tasks.find((x) => x.id === taskId);
    if (t && Array.isArray(t.selected_fields) && t.selected_fields.length) return t.selected_fields;
    return TYPE_FIELDS[granularity] || TYPE_FIELDS.day;
  }, [tasks, taskId, granularity]);

  const hasData = dayRows.length > 0 || granularRows.length > 0;

  const metrics: { label: string; value: string }[] = [
    { label: 'GMV（销售额）', value: `¥${overview.gmv.toLocaleString('zh-CN')}` },
    { label: '成交件数', value: overview.pieces.toLocaleString('zh-CN') },
    { label: '观看人次', value: overview.views.toLocaleString('zh-CN') },
    { label: '新增粉丝', value: overview.fans.toLocaleString('zh-CN') },
  ];

  return (
    <div className="mt-6 rounded-lg border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">③ 采集结果 / 数据明细</h2>
        <select
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          <option value="__all__">全部任务</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.key}
              onClick={() => setGranularity(g.key)}
              className={`rounded-md px-2.5 py-1.5 text-xs transition ${
                granularity === g.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">至</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted/60 disabled:opacity-60"
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {!touched ? (
        <p className="py-8 text-center text-sm text-muted-foreground">加载中…</p>
      ) : !hasData ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">暂无数据</p>
          <p className="mt-1 text-xs text-muted-foreground/70">该区间尚未执行采集，或采集未产出行。可先配置任务「立即执行」后再查看。</p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="mt-1 text-lg font-semibold">{m.value}</p>
              </div>
            ))}
          </div>

          {overview.gmv > 0 || overview.views > 0 ? (
            <div className="mb-4 rounded-lg border border-border bg-card p-3">
              <p className="mb-2 text-sm font-medium">GMV / 观看人次 趋势（按统计日）</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trend} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
                    labelStyle={{ color: 'var(--foreground)' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="gmv" name="GMV" stroke="var(--primary)" strokeWidth={2} />
                  <Line type="monotone" dataKey="views" name="观看人次" stroke="var(--chart-2, #16a34a)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {selectedFields.map((f) => (
                    <th key={f} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
                      {labelOf(f)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {granularRows.length === 0 ? (
                  <tr>
                    <td colSpan={selectedFields.length} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      当前粒度（{GRANULARITIES.find((g) => g.key === granularity)?.label}）暂无数据；已入库 {dayRows.length} 条每日行。
                    </td>
                  </tr>
                ) : (
                  granularRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      {selectedFields.map((f) => (
                        <td key={f} className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                          {fmt(r.row_json?.[f], f)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}