'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisPayload } from '../api/data-analysis/lib';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/date-range-picker';

type SortKey = 'totalGmv' | 'avgGmv' | 'gmvPerHour' | 'refundRate' | 'sessions';

const SLOTS = ['凌晨', '上午', '下午', '晚间'];
const QUICK = [
  { key: 'all', label: '全部' },
  { key: '30d', label: '近30天' },
  { key: '90d', label: '近90天' },
  { key: 'year', label: '本年度' },
];

// —— 数值/格式化工具（与全站同一口径） ——
const money = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
const money0 = (x: number) =>
  Number.isFinite(x) ? x.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(2) + '%' : '—');
const compact = (x: number) => {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e8) return (x / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return (x / 1e4).toFixed(1) + '万';
  return money(x);
};
const num = (x: number) => (Number.isFinite(x) ? x.toLocaleString('zh-CN') : '—');
const round1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : 0);
const timePad = (h: number) => `${String(h).padStart(2, '0')}:00`;

const T1 = 'text-white/[0.92]';
const T2 = 'text-white/[0.65]';
const T3 = 'text-white/[0.40]';
const CARD = 'rounded-xl border border-white/[0.08] bg-[#1E2235] p-5';
const ACCENT = '#4158D0';

export default function DataAnalysisPage() {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 筛选
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [host, setHost] = useState('');
  const [slot, setSlot] = useState('');
  const [today, setToday] = useState('');
  const [hostSearch, setHostSearch] = useState('');
  const [hostOpen, setHostOpen] = useState(false);

  const loadRef = useRef(0);
  useEffect(() => {
    const id = ++loadRef.current;
    const params = new URLSearchParams();
    if (start && end) {
      params.set('start', start);
      params.set('end', end);
    }
    if (host) params.set('host', host);
    if (slot) params.set('slot', slot);
    setLoading(true);
    fetch(`/api/data-analysis?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (id !== loadRef.current) return;
        if (j?.success && j?.data) {
          setData(j.data);
          setHosts(j.hosts || []);
          setToday(j.today || '');
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (id !== loadRef.current) return;
        setError(true);
        setLoading(false);
      });
  }, [start, end, host, slot]);

  const applyQuick = (key: string) => {
    if (!today) return;
    const t = new Date(today + 'T00:00:00');
    if (key === 'all') {
      setStart('');
      setEnd('');
      return;
    }
    if (key === '30d') {
      const s = new Date(t);
      s.setDate(s.getDate() - 29);
      setStart(fmtDate(s));
      setEnd(today);
      return;
    }
    if (key === '90d') {
      const s = new Date(t);
      s.setDate(s.getDate() - 89);
      setStart(fmtDate(s));
      setEnd(today);
      return;
    }
    if (key === 'year') {
      setStart(t.getFullYear() + '-01-01');
      setEnd(today);
    }
  };

  const selectedQuick = useMemo(() => {
    if (!start && !end) return 'all';
    if (today && start === fmtDate(new Date(new Date(today + 'T00:00:00').getTime() - 29 * 86400000)) && end === today) return '30d';
    if (today && start === fmtDate(new Date(new Date(today + 'T00:00:00').getTime() - 89 * 86400000)) && end === today) return '90d';
    if (today && start === new Date(today + 'T00:00:00').getFullYear() + '-01-01' && end === today) return 'year';
    return '';
  }, [start, end, today]);

  const hostFiltered = useMemo(
    () => hosts.filter((h) => h.toLowerCase().includes(hostSearch.trim().toLowerCase())),
    [hosts, hostSearch]
  );

  const d = data;
  const empty = !!d && d.totals.sessions === 0;

  return (
    <div className="space-y-6">
      {/* 页头 / 标题 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={cn('text-[20px] font-medium', T1)}>数据分析</h1>
          <p className={cn('mt-1 text-[12px]', T3)}>
            数据来源：飞书《vivo大号直播数据》子表「主播数据」 · 只读分析 · 基线导出 2026-10-22 · 全量 {num(3873)} 场
          </p>
        </div>
        {!empty && d && (
          <div className={cn('text-[12px]', T3)}>
            覆盖 <span className={T1}>{num(d.totals.sessions)}</span> 场 · 总时长{' '}
            <span className={T1}>{num(round1(d.totals.durationH))}h</span>
            {d.totals.dateInvalid > 0 && (
              <span className="text-[#FF9F0A]"> · {d.totals.dateInvalid} 场日期异常未纳入日期维度</span>
            )}
          </div>
        )}
      </div>

      {/* 筛选区 */}
      <div className={cn(CARD, 'space-y-3')}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* 日期 */}
          <div className="flex items-center gap-2">
            <span className={cn('text-[12px]', T3)}>日期</span>
            <DateRangePicker
              start={start}
              end={end}
              today={today}
              onApply={(r) => {
                setStart(r.start);
                setEnd(r.end);
              }}
            />
            {QUICK.map((q) => (
              <button
                key={q.key}
                onClick={() => applyQuick(q.key)}
                className={cn(
                  'h-8 rounded-md px-3 text-[12px] transition-colors',
                  selectedQuick === q.key ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
                )}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* 主播 */}
          <div className="relative flex items-center gap-2">
            <span className={cn('text-[12px]', T3)}>主播</span>
            <button
              onClick={() => setHostOpen((v) => !v)}
              className="flex h-8 min-w-[160px] items-center justify-between rounded-md border border-white/[0.08] bg-[#151827] px-3 text-[13px] text-white/[0.92]"
            >
              <span className={host ? '' : T3}>{host || '全部主播(48)'}</span>
              <span className={cn('ml-2 text-[10px]', T3)}>▾</span>
            </button>
            {hostOpen && (
              <div className="absolute left-0 top-10 z-20 w-64 rounded-lg border border-white/[0.08] bg-[#1E2235] p-2 shadow-xl">
                <input
                  autoFocus
                  value={hostSearch}
                  onChange={(e) => setHostSearch(e.target.value)}
                  placeholder="搜索主播"
                  className="mb-2 h-8 w-full rounded-md border border-white/[0.08] bg-[#151827] px-2 text-[13px] text-white/[0.92] outline-none"
                />
                <div className="max-h-64 overflow-y-auto">
                  <button
                    onClick={() => {
                      setHost('');
                      setHostOpen(false);
                      setHostSearch('');
                    }}
                    className={cn(
                      'block w-full rounded px-2 py-1.5 text-left text-[13px]',
                      !host ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
                    )}
                  >
                    全部主播
                  </button>
                  {hostFiltered.map((h) => (
                    <button
                      key={h}
                      onClick={() => {
                        setHost(h);
                        setHostOpen(false);
                        setHostSearch('');
                      }}
                      className={cn(
                        'block w-full rounded px-2 py-1.5 text-left text-[13px]',
                        host === h ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
                      )}
                    >
                      {h}
                    </button>
                  ))}
                  {hostFiltered.length === 0 && <div className={cn('px-2 py-2 text-[12px]', T3)}>无匹配主播</div>}
                </div>
              </div>
            )}
          </div>

          {/* 时段 */}
          <div className="flex items-center gap-2">
            <span className={cn('text-[12px]', T3)}>时段</span>
            <button
              onClick={() => setSlot('')}
              className={cn(
                'h-8 rounded-md px-3 text-[12px] transition-colors',
                !slot ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
              )}
            >
              全部
            </button>
            {SLOTS.map((s) => (
              <button
                key={s}
                onClick={() => setSlot(slot === s ? '' : s)}
                className={cn(
                  'h-8 rounded-md px-3 text-[12px] transition-colors',
                  slot === s ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className={cn(CARD, 'text-center text-[13px]', T3)}>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4158D0] border-t-transparent mx-auto" />
          <p className="mt-3">数据计算中…</p>
        </div>
      )}

      {error && (
        <div className={cn(CARD, 'text-center text-[13px] text-[#FF9F0A]')}>数据加载失败，请刷新重试。</div>
      )}

      {!loading && !error && empty && d && (
        <div className={cn(CARD, 'py-16 text-center')}>
          <p className={cn('text-[15px]', T1)}>当前筛选条件下无数据</p>
          <p className={cn('mt-2 text-[13px]', T3)}>请调整日期范围 / 主播 / 时段后重试。</p>
        </div>
      )}

      {!loading && !error && d && !empty && (
        <>
          <IssueBanner d={d} />
          <KpiCards d={d} />
          <SlotSection d={d} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <HourDist d={d} />
            <DurationEff d={d} />
          </div>
          <HostRank d={d} />
          <CrossSection d={d} />
          <BigSessions d={d} />
          <DoubleVsSolo d={d} />
          <Insights d={d} />
          <QaSection />
        </>
      )}
    </div>
  );
}

function fmtDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// —— 已知数据问题横幅 ——
function IssueBanner({ d }: { d: AnalysisPayload }) {
  const items: string[] = [];
  if (d.totals.dateInvalid > 0) items.push(`${d.totals.dateInvalid} 场日期缺少年份，数值计入总量但不参与日期维度`);
  if (d.flags.negSettle > 0) items.push(`${d.flags.negSettle} 行结算为负，已如实保留原值并计入汇总`);
  if (d.flags.reconBad > 0) items.push(`${d.flags.reconBad} 场对账超限，仅标记不修正`);
  if (d.flags.peakDup401700 > 0) items.push(`${d.flags.peakDup401700} 场在线峰值 401,700 重复，峰值类结论请谨慎引用`);
  if (d.flags.bigSessionsCount > 0)
    items.push(`${d.flags.bigSessionsCount} 场 GMV>200万 拉高均值，最大 ${money(d.flags.maxGmv)}（2025-10-13 漫漫·芙芙双播）`);
  if (items.length === 0) return null;
  return (
    <div className={cn(CARD, 'border-[#FF9F0A]/40 py-3')}>
      <div className={cn('mb-2 flex items-center gap-2 text-[13px] font-medium', T1)}>
        <span className="inline-block h-2 w-2 rounded-full bg-[#FF9F0A]" />
        已知数据说明
      </div>
      <ul className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        {items.map((t, i) => (
          <li key={i} className={cn('text-[12px] text-[#FF9F0A]')}>
            · {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KpiCard({ label, primary, primaryUnit, main, sub, accent }: { label: string; primary: string; primaryUnit?: string; main: string; sub: string; accent?: string }) {
  return (
    <div className={cn(CARD, 'space-y-3')}>
      <div className={cn('text-[13px]', T3)}>{label}</div>
      <div className={cn('flex items-baseline gap-1')}>
        <span className={cn('text-[32px] font-semibold tabular-nums leading-none', T1)} style={accent ? { color: accent } : undefined}>
          {primary}
        </span>
        {primaryUnit && <span className={cn('text-[12px]', T3)}>{primaryUnit}</span>}
      </div>
      <div className={cn('text-[12px] leading-relaxed', T2)}>{main}</div>
      <div className={cn('text-[12px]', T3)}>{sub}</div>
    </div>
  );
}

function KpiCards({ d }: { d: AnalysisPayload }) {
  const k = d.kpi;
  const cards = [
    {
      label: '总 GMV',
      primary: money(Math.round(k.totalGmv)),
      primaryUnit: '元',
      main: `场均 ${compact(Math.round(k.gmvPerSession))} 元`,
      sub: '',
    },
    {
      label: '总结算金额',
      primary: money(Math.round(k.totalSettle)),
      primaryUnit: '元',
      main: `结算率 ${pct(k.settleRate)}`,
      sub: `总退款 ${money(Math.round(k.totalRefund))} 元 · 退款率 ${pct(k.totalRefundRate)}`,
    },
    {
      label: '累计观看人数',
      primary: num(Math.round(k.totalView)),
      primaryUnit: '人',
      main: `场均 ${money0(Math.round(k.viewPerSession))} 人 · UV价值 ${money(k.uvValue)}${k.realUvValue ? ` / 真实UV ${money(k.realUvValue)}` : ''}`,
      sub: '',
    },
    {
      label: '累计成交人数',
      primary: num(Math.round(k.totalDeal)),
      primaryUnit: '人',
      main: `成交率 ${pct(k.viewDealRate)}`,
      sub: `GPM（场均） ${money(Math.round(k.gpm))}`,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}

function Section({ title, sub, children, aside }: { title: string; sub?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={cn(CARD, 'space-y-4')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className={cn('text-[16px] font-medium', T1)}>{title}</h2>
          {sub && <p className={cn('mt-1 text-[12px]', T3)}>{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

// —— 分时段 ——
function SlotSection({ d }: { d: AnalysisPayload }) {
  return (
    <Section title="分时段分析" sub="按开播小时划分：凌晨00-06 / 上午06-12 / 下午12-18 / 晚间18-24">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.slots.map((s) => {
          const w = Math.max(2, Math.round(s.gmvShare * 100));
          return (
            <div key={s.slot} className="rounded-lg border border-white/[0.08] bg-[#151827] p-4">
              <div className="flex items-center justify-between">
                <span className={cn('text-[13px] font-medium', T1)}>{s.slot}</span>
                {s.alert && (
                  <span className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#FF9F0A]">退款率异常偏高</span>
                )}
              </div>
              <div className={cn('mt-3 text-[20px] font-semibold tabular-nums', T1)}>{compact(s.gmv)}</div>
              <div className={cn('text-[12px]', T3)}>场次 {num(s.sessions)} · 占比 {pct(s.gmvShare)}</div>
              <div className="mt-3 h-1.5 w-full rounded-full bg-white/[0.08]">
                <div className="h-1.5 rounded-full bg-[#4158D0]" style={{ width: `${w}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-[12px]">
                <span className={T3}>GPM</span>
                <span className={cn('tabular-nums', s.refundRate > 0.5 ? 'text-[#FF9F0A]' : T1)}>{money(Math.round(s.gpm))}</span>
              </div>
              <div className="mt-1 flex justify-between text-[12px]">
                <span className={T3}>退款率</span>
                <span className={cn('tabular-nums', s.refundRate > 0.5 ? 'text-[#FF9F0A]' : T1)}>{pct(s.refundRate)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className={cn('text-[12px] leading-relaxed', T2)}>
        凌晨档综合退款率 {pct(d.slots.find((x) => x.slot === '凌晨')?.refundRate || 0)}、晚间档{' '}
        {pct(d.slots.find((x) => x.slot === '晚间')?.refundRate || 0)}，属本轮实测真实高值，已用告警色标注，建议运营专项治理。
      </p>
    </Section>
  );
}

// —— 开播小时分布（SVG） ——
function HourDist({ d }: { d: AnalysisPayload }) {
  const max = Math.max(1, ...d.hourDist.map((h) => h.gmv));
  const W = 720;
  const H = 180;
  const pad = 6;
  const bw = (W - pad * 2) / 24;
  const top = [...d.hourDist].sort((a, b) => b.gmv - a.gmv)[0];
  return (
    <Section title="开播小时分布" sub="24 小时开播场数与 GMV（柱高=GMV，峰值已标注）">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {d.hourDist.map((h, i) => {
          const bh = (h.gmv / max) * (H - 34);
          return (
            <g key={i}>
              <rect x={pad + i * bw + 1} y={H - 10 - bh} width={bw - 2} height={bh} rx={2} fill={h.hour === top.hour ? ACCENT : `#4158D0${i % 2 ? 'aa' : 'cc'}`} opacity={h.hour === top.hour ? 1 : 0.75} />
              {i % 2 === 0 && (
                <text x={pad + i * bw + bw / 2} y={H - 2} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">
                  {h.hour}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className={cn('text-[12px]', T2)}>
        开播高峰在 <span className={T1}>{timePad(top.hour)}</span>（GMV {compact(top.gmv)}），该小时开播 {num(top.sessions)} 场。
      </p>
    </Section>
  );
}

// —— 时长效率 ——
function DurationEff({ d }: { d: AnalysisPayload }) {
  const max = Math.max(1, ...d.durationEff.map((x) => x.gmvPerSession));
  return (
    <Section title="直播时长效率" sub="按时长分组统计场均 GMV 与场次">
      <div className="space-y-3">
        {d.durationEff.map((g) => {
          const w = Math.max(3, (g.gmvPerSession / max) * 100);
          return (
            <div key={g.label} className="flex items-center gap-3">
              <div className={cn('w-14 shrink-0 text-[12px]', T2)}>{g.label}</div>
              <div className="h-8 flex-1 overflow-hidden rounded-md bg-white/[0.06]">
                <div className="flex h-full items-center rounded-md bg-[#4158D0]/85 px-2" style={{ width: `${w}%`, minWidth: 40 }}>
                  <span className={cn('text-[12px] tabular-nums text-white')}>{compact(g.gmvPerSession)}</span>
                </div>
              </div>
              <div className={cn('w-40 shrink-0 text-right text-[12px] tabular-nums', T3)}>{num(g.sessions)} 场 · {compact(g.gmv)}</div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

const rankCols: { key: SortKey; label: string }[] = [
  { key: 'totalGmv', label: '总GMV' },
  { key: 'avgGmv', label: '场均GMV' },
  { key: 'gmvPerHour', label: '时效(GMV/h)' },
  { key: 'refundRate', label: '退款率' },
  { key: 'sessions', label: '场次' },
];

function HostRank({ d }: { d: AnalysisPayload }) {
  const [sortKey, setSortKey] = useState<SortKey>('totalGmv');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const sorted = useMemo(() => {
    const arr = [...d.hostRank].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return asc ? va - vb : vb - va;
    });
    return arr;
  }, [d.hostRank, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const rows = sorted.slice(cur * pageSize, cur * pageSize + pageSize);
  const top3 = new Map(sorted.slice(0, 3).map((r, i) => [r.name, i]));

  const toggle = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === 'refundRate' ? true : false);
    }
  };

  return (
    <Section
      title="分主播数据排名"
      sub={`全量 ${num(d.hostRank.length)} 位主播 · 点击表头切换排序 · 前三名金/银/铜色标`}
      aside={
        <div className="flex items-center gap-1">
          {[10, 20, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => {
                setPageSize(n);
                setPage(0);
              }}
              className={cn(
                'h-7 rounded px-2 text-[12px]',
                pageSize === n ? 'bg-[#4158D0] text-white' : 'text-white/[0.65] hover:bg-white/[0.05]'
              )}
            >
              {n}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">排名</th>
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">主播</th>
              {rankCols.map((c) => (
                <th key={c.key}>
                  <button
                    onClick={() => toggle(c.key)}
                    className={cn('flex items-center gap-1 py-2 pr-2 text-[12px]', sortKey === c.key ? 'text-white/[0.92]' : 'text-white/[0.40] hover:text-white/[0.65]')}
                  >
                    {c.label}
                    {sortKey === c.key && <span className="text-[10px]">{asc ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const medal = top3.get(r.name);
              return (
                <tr key={r.name} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="py-3 pr-2 text-[12px] tabular-nums" style={{ color: medal === 0 ? '#FFD700' : medal === 1 ? '#C0C0C0' : medal === 2 ? '#CD7F32' : 'rgba(255,255,255,0.40)' }}>
                    {top3.has(r.name) ? ['🥇', '🥈', '🥉'][medal!] : cur * pageSize + rows.indexOf(r) + 1}
                  </td>
                  <td className="py-3 pr-2 text-[13px] text-white/[0.92]">{r.name}</td>
                  <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.92]">{compact(r.totalGmv)}</td>
                  <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.65]">{compact(r.avgGmv)}</td>
                  <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.65]">{compact(r.gmvPerHour)}</td>
                  <td className={cn('py-3 pr-2 text-[13px] tabular-nums', r.refundRate > 0.5 ? 'text-[#FF9F0A]' : 'text-white/[0.65]')}>{pct(r.refundRate)}</td>
                  <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.65]">
                    {num(r.sessions)}
                    {r.doubleSessions > 0 && <span className={cn('ml-1 text-[11px]', T3)}>(双{r.doubleSessions})</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className={cn('text-[12px]', T3)}>共 {num(sorted.length)} 位</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(Math.max(0, cur - 1))}
            disabled={cur === 0}
            className="h-7 rounded px-2 text-[12px] text-white/[0.65] hover:bg-white/[0.05] disabled:opacity-40"
          >
            上一页
          </button>
          <span className={cn('px-2 text-[12px] tabular-nums', T2)}>
            {cur + 1}/{pages}
          </span>
          <button
            onClick={() => setPage(Math.min(pages - 1, cur + 1))}
            disabled={cur >= pages - 1}
            className="h-7 rounded px-2 text-[12px] text-white/[0.65] hover:bg-white/[0.05] disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>
    </Section>
  );
}

function CrossSection({ d }: { d: AnalysisPayload }) {
  const maxGmv = Math.max(1, ...d.crossTop10.flatMap((h) => h.rows.map((r) => r.gmv)));
  return (
    <Section title="主播 × 时段交叉分析" sub="Top10 主播(按总GMV) × 四时段；组合场次<3 标「样本不足」不作强结论">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">主播 \ 时段</th>
              {SLOTS.map((s) => (
                <th key={s} className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.crossTop10.map((h) => (
              <tr key={h.name} className="border-b border-white/[0.04] align-top">
                <td className="py-3 pr-2 text-[13px] text-white/[0.92]">
                  {h.name}
                  <span className={cn('block text-[11px]', T3)}>{compact(h.totalGmv)}</span>
                </td>
                {h.rows.map((r) => (
                  <td key={r.slot} className="py-3 pr-2">
                    <div
                      className="rounded-md px-3 py-2"
                      style={{
                        backgroundColor: `rgba(65,88,208,${0.08 + (r.gmv / maxGmv) * 0.4})`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn('text-[13px] font-medium tabular-nums', r.gmv ? T1 : T3)}>{compact(r.gmv)}</span>
                        {r.sampleSmall && <span className="rounded bg-white/[0.08] px-1 text-[10px] text-[#FF9F0A]">样本不足</span>}
                      </div>
                      <div className={cn('text-[11px] tabular-nums', T3)}>场 {num(r.sessions)} · 场均 {compact(r.avgGmv || 0)}</div>
                      <div className={cn('text-[11px] tabular-nums', T3)}>GPM {money(Math.round(r.gpm || 0))}</div>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function BigSessions({ d }: { d: AnalysisPayload }) {
  if (d.bigSessions.length === 0) {
    return (
      <Section title="超大场 TOP 榜" sub={`GMV > ${money0(2000000)} 的场次`}>
        <div className={cn('text-[13px]', T3)}>当前筛选下无该规模场次。</div>
      </Section>
    );
  }
  return (
    <Section title="超大场 TOP 榜" sub={`GMV 超过 ${money0(2000000)} 的场次，共 ${num(d.bigSessions.length)} 场`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08]">
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">日期</th>
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">主播 / 组合</th>
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">开播时间</th>
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">GMV</th>
              <th className="py-2 pr-2 text-left text-[12px] font-normal text-white/[0.40]">类型</th>
            </tr>
          </thead>
          <tbody>
            {d.bigSessions.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.65]">{r.date || '—日期异常'}</td>
                <td className="py-3 pr-2 text-[13px] text-white/[0.92]">{r.hosts.join(' · ')}</td>
                <td className="py-3 pr-2 text-[13px] tabular-nums text-white/[0.65]">{r.startHour != null ? timePad(r.startHour) : '—'}</td>
                <td className="py-3 pr-2 text-[13px] font-medium tabular-nums text-white/[0.92]">{money(r.gmv)}</td>
                <td className="py-3 pr-2">
                  {r.isDouble ? <span className="rounded bg-[#4158D0]/20 px-1.5 py-0.5 text-[11px] text-white/[0.92]">双播</span> : <span className={cn('text-[11px]', T3)}>常规</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={cn('text-[12px]', T3)}>注：超大场会显著拉高场均，引用「场均」指标时请留意其影响。</p>
    </Section>
  );
}

function DoubleVsSolo({ d }: { d: AnalysisPayload }) {
  const { double, solo } = d.doubleVsSolo;
  const card = (t: string, x: typeof double, color: string) => (
    <div className="flex-1 rounded-lg border border-white/[0.08] bg-[#151827] p-4">
      <div className="flex items-center gap-2">
        <span className={cn('text-[13px] font-medium', T1)}>{t}</span>
        <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[11px] uppercase" style={{ color }}>
          {t === '双播场' ? 'DOUBLE' : 'SOLO'}
        </span>
      </div>
      <div className={cn('mt-3 text-[20px] font-semibold tabular-nums', T1)}>{compact(x.gmv)}</div>
      <div className={cn('text-[12px]', T3)}>{num(x.sessions)} 场 · 场均 {compact(x.avgGmv)}</div>
      <div className="mt-1 flex justify-between text-[12px]">
        <span className={T3}>退款率</span>
        <span className={cn('tabular-nums', x.refundRate > 0.5 ? 'text-[#FF9F0A]' : T1)}>{pct(x.refundRate)}</span>
      </div>
    </div>
  );
  return (
    <Section title="双播 vs 常规" sub={`双播 ${num(double.sessions)} 场 · 常规(个人场) ${num(solo.sessions)} 场`}>
      <div className="flex flex-col gap-4 sm:flex-row">
        {card('双播场', double, '#34C759')}
        {card('常规场', solo, '#F5483B')}
      </div>
      <div className="rounded-lg border border-white/[0.08] bg-[#151827] p-4 text-[13px] leading-relaxed text-white/[0.92]">
        双播场均 GMV 约为常规的 <span className="font-semibold tabular-nums" style={{ color: '#34C759' }}>{d.doubleVsSolo.ratioAvgGmv.toFixed(1)} 倍</span>
        {double.gmv > 0 && solo.gmv > 0 && (
          <span className={cn('block mt-1 text-[12px]', T2)}>
            双播用 {num(double.sessions)} 场贡献 {pct(double.gmv / ((double.gmv || 0) + (solo.gmv || 0)))} 的 GMV；但退款率{' '}
            {double.refundRate > solo.refundRate ? '高于' : '低于'}常规（{pct(double.refundRate)} vs {pct(solo.refundRate)}）。
          </span>
        )}
      </div>
    </Section>
  );
}

function Insights({ d }: { d: AnalysisPayload }) {
  return (
    <Section title="分析维度建议" sub="基于当前筛选数据的运营视角结论（全部引用实际计算值）">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {d.insights.map((it) => (
          <div key={it.dimension} className="rounded-lg border border-white/[0.08] bg-[#151827] p-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#4158D0]" />
              <span className={cn('text-[13px] font-medium', T1)}>{it.title}</span>
              <span className={cn('text-[11px]', T3)}>{it.dimension}</span>
            </div>
            <p className={cn('mt-2 text-[13px] leading-relaxed', T2)}>{it.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// —— 数据问答 ——
type QAItem = { type: string; title: string; body: string; rows?: { label: string; value: string }[] };

const EXAMPLES = ['漫漫 vs 芙芙', '退款率排行', '凌晨', '双播 vs 常规', '漫漫 双播几场', '漫漫'];

function QaSection() {
  const [q, setQ] = useState('');
  const [asking, setAsking] = useState(false);
  const [ans, setAns] = useState<QAItem | null>(null);
  const [history, setHistory] = useState<QAItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('blue_da_qa');
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || asking) return;
    setAsking(true);
    setQ(t);
    fetch('/api/data-analysis/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: t }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j?.answer) {
          setAns(j.answer);
          setHistory((prev) => {
            const next = [j.answer, ...prev].slice(0, 20);
            try {
              localStorage.setItem('blue_da_qa', JSON.stringify(next));
            } catch {
              /* ignore */
            }
            return next;
          });
        }
      })
      .finally(() => setAsking(false));
  };

  const del = (i: number) =>
    setHistory((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      try {
        localStorage.setItem('blue_da_qa', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <Section title="数据问答" sub="基于《主播数据》实时计算 · 记录保存在本机(最多20条)">
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e}
            onClick={() => ask(e)}
            className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[12px] text-white/[0.65] hover:bg-white/[0.05]"
          >
            {e}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(q)}
          placeholder="输入问题，如：漫漫 vs 芙芙"
          className="h-10 flex-1 rounded-lg border border-white/[0.08] bg-[#151827] px-3 text-[13px] text-white/[0.92] outline-none focus:border-[#4158D0]"
        />
        <button
          onClick={() => ask(q)}
          disabled={asking || !q.trim()}
          className="h-10 rounded-lg bg-[#4158D0] px-4 text-[13px] text-white disabled:opacity-50"
        >
          {asking ? '计算中…' : '提问'}
        </button>
      </div>

      {ans && (
        <div className="rounded-lg border border-[#4158D0]/30 bg-[#151827] p-4">
          <div className={cn('text-[14px] font-medium', T1)}>{ans.title}</div>
          <p className={cn('mt-2 text-[13px] leading-relaxed', T2)}>{ans.body}</p>
          {ans.rows && (
            <ul className="mt-3 space-y-1">
              {ans.rows.map((r, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-white/[0.04] pb-1 text-[13px]">
                  <span className={cn('shrink-0', T2)}>{r.label}</span>
                  <span className={cn('text-right tabular-nums', T1)}>{r.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <div className={cn('mb-2 text-[12px]', T3)}>提问记录（{num(history.length)}/20）</div>
          <ul className="space-y-1.5">
            {history.map((h, i) => (
              <li key={i} className="group flex items-start justify-between gap-3 rounded-md border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <div className={cn('text-[13px] font-medium', T1)}>{h.title}</div>
                  <div className={cn('mt-0.5 truncate text-[12px]', T2)} title={h.body}>{h.body}</div>
                </div>
                <button
                  onClick={() => del(i)}
                  className="text-[12px] text-white/[0.40] hover:text-[#F5483B]"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}