// 数据分析：服务端聚合（只读本地 src/data 数据文件，不改源表）。
import records_raw from '../../../data/records.json';
import aggregates_raw from '../../../data/aggregates.json';

type Rec = {
  date: string | null;
  date_valid: boolean;
  start_hour: number | null;
  end_hour: number | null;
  cross_day: boolean;
  time_valid: boolean;
  slot: '凌晨' | '上午' | '下午' | '晚间' | null;
  hosts: string[];
  host_count: number;
  is_double: boolean;
  duration_h: number;
  gmv: number;
  refund_amt: number;
  settle_amt: number;
  refund_rate: number | null;
  conv_rate: number | null;
  view_persons: number | null;
  deal_persons: number | null;
  gpm: number | null;
  uv_value: number | null;
  real_uv_value: number | null;
  peak_online: number | null;
  neg_settle: boolean;
  recon_bad: boolean;
  peak_dup_401700: boolean;
};

const RECORDS = records_raw as unknown as Rec[];
const AGG = aggregates_raw as unknown as Record<string, unknown>;

const SLOTS = ['凌晨', '上午', '下午', '晚间'] as const;

// 供日期快捷项使用的"今天"参照（以数据最新日期为准，纯分析参照）
export function referenceToday(): string {
  let max = '';
  for (const r of RECORDS) {
    if (r.date && r.date_valid && r.date > max) max = r.date;
  }
  return max || '2026-10-21';
}

export function allHosts(): string[] {
  const set = new Set<string>();
  for (const r of RECORDS) for (const h of r.hosts || []) set.add(h);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh'));
}

export function filterRecords(filter: {
  start?: string;
  end?: string;
  host?: string;
  slot?: string;
}): Rec[] {
  const { start, end, host, slot } = filter;
  return RECORDS.filter((r) => {
    if (start && end) {
      if (!r.date || !r.date_valid) return false;
      if (r.date < start || r.date > end) return false;
    }
    if (host && !(r.hosts || []).includes(host)) return false;
    if (slot && r.slot !== slot) return false;
    return true;
  });
}

const sum = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) : 0);
const mean = (arr: number[]) => (arr.length ? sum(arr) / arr.length : 0);

export interface SlotDatum {
  slot: string;
  sessions: number;
  gmv: number;
  gmvShare: number; // 0-1
  gpm: number;
  refundRate: number; // 0-1
  avgGmv?: number; // 场均GMV（交叉表专用）
  sampleSmall?: boolean; // 组合场次<3，样本不足
  alert: boolean;
}

export interface HostDatum {
  name: string;
  sessions: number;
  totalGmv: number;
  avgGmv: number;
  gmvPerHour: number;
  refundRate: number; // 0-1
  doubleSessions: number;
  totalDurationH: number;
}

export interface Insight {
  dimension: string;
  title: string;
  body: string;
}

export interface AnalysisPayload {
  filters: { start: string; end: string; host: string; slot: string; today: string };
  totals: { sessions: number; dateInvalid: number; timeFail: number; durationH: number };
  kpi: {
    totalGmv: number;
    gmvPerSession: number;
    totalSettle: number;
    settleRate: number; // 0-1
    totalRefund: number;
    totalRefundRate: number; // 0-1
    totalView: number;
    viewPerSession: number;
    uvValue: number;
    realUvValue: number;
    totalDeal: number;
    viewDealRate: number; // 0-1
    gpm: number;
    totalDurationH: number;
    bigSessionsCount: number;
  };
  slots: SlotDatum[];
  hourDist: { hour: number; sessions: number; gmv: number; flag: number }[];
  durationEff: { label: string; sessions: number; gmv: number; gmvPerSession: number }[];
  hostRank: HostDatum[];
  crossTop10: { name: string; totalGmv: number; rows: (SlotDatum & { sampleSmall: boolean })[] }[];
  bigSessions: { date: string | null; hosts: string[]; startHour: number | null; gmv: number; isDouble: boolean }[];
  doubleVsSolo: {
    double: { sessions: number; gmv: number; avgGmv: number; refundRate: number; view: number };
    solo: { sessions: number; gmv: number; avgGmv: number; refundRate: number; view: number };
    ratioSessions: number; // 场次比(常规/双播)
    ratioAvgGmv: number; // 场均GMV倍(双播/常规)
  };
  insights: Insight[];
  flags: Record<string, number>;
}

const BIG_GMV_THRESHOLD = 2000000;
const SAMPLE_LOW = 3;

export function analyze(filter: { start?: string; end?: string; host?: string; slot?: string }): AnalysisPayload {
  const sel = filterRecords(filter);

  const sessions = sel.length;
  const totalGmv = sum(sel.map((r) => r.gmv));
  const totalSettle = sum(sel.map((r) => r.settle_amt));
  const totalRefund = sum(sel.map((r) => r.refund_amt));
  const totalView = sum(sel.map((r) => r.view_persons || 0));
  const totalDeal = sum(sel.map((r) => r.deal_persons || 0));
  const totalDurationH = sum(sel.map((r) => r.duration_h));
  const dateInvalid = sel.filter((r) => !r.date_valid).length;
  const timeFail = sel.filter((r) => !r.time_valid).length;
  const gpmList = sel.filter((r) => r.gpm != null).map((r) => r.gpm as number);

  const kpi = {
    totalGmv,
    gmvPerSession: sessions ? totalGmv / sessions : 0,
    totalSettle,
    settleRate: totalGmv ? totalSettle / totalGmv : 0,
    totalRefund,
    totalRefundRate: totalGmv ? totalRefund / totalGmv : 0,
    totalView,
    viewPerSession: sessions ? totalView / sessions : 0,
    uvValue: totalView ? totalGmv / totalView : 0,
    realUvValue: totalView ? totalSettle / totalView : 0,
    totalDeal,
    viewDealRate: totalView ? totalDeal / totalView : 0,
    gpm: gpmList.length ? mean(gpmList) : 0,
    totalDurationH,
    bigSessionsCount: sel.filter((r) => r.gmv > BIG_GMV_THRESHOLD).length,
  };

  // 分时段（仅 time_valid 参与，下同口径）
  const slots: SlotDatum[] = SLOTS.map((slot) => {
    const list = sel.filter((r) => r.slot === slot);
    const g = sum(list.map((r) => r.gmv));
    const rf = sum(list.map((r) => r.refund_amt));
    const gpm = mean(list.filter((r) => r.gpm != null).map((r) => r.gpm as number));
    const refundRate = g ? rf / g : 0;
    const alarmSet = new Set<string>(['凌晨', '晚间']);
    return {
      slot,
      sessions: list.length,
      gmv: g,
      gmvShare: totalGmv ? g / totalGmv : 0,
      gpm,
      refundRate,
      alert: alarmSet.has(slot) && refundRate > 0.3,
    };
  });

  // 24 小时开播分布
  const hourDist = Array.from({ length: 24 }, (_, hour) => {
    const list = sel.filter((r) => r.start_hour === hour);
    return { hour, sessions: list.length, gmv: sum(list.map((r) => r.gmv)), flag: 0 };
  });

  // 时长效率
  const durGroups: { label: string; test: (h: number) => boolean }[] = [
    { label: '≤2h', test: (h) => h <= 2 },
    { label: '2-4h', test: (h) => h > 2 && h <= 4 },
    { label: '4-6h', test: (h) => h > 4 && h <= 6 },
    { label: '6h以上', test: (h) => h > 6 },
  ];
  const durationEff = durGroups.map((g) => {
    const list = sel.filter((r) => g.test(r.duration_h));
    const gmv = sum(list.map((r) => r.gmv));
    return {
      label: g.label,
      sessions: list.length,
      gmv,
      gmvPerSession: list.length ? gmv / list.length : 0,
    };
  });

  // 分主播
  const hostMap = new Map<string, HostDatum>();
  for (const r of sel) {
    for (const h of r.hosts || []) {
      let d = hostMap.get(h);
      if (!d) {
        d = { name: h, sessions: 0, totalGmv: 0, avgGmv: 0, gmvPerHour: 0, refundRate: 0, doubleSessions: 0, totalDurationH: 0 };
        hostMap.set(h, d);
      }
      d.sessions += 1;
      d.totalGmv += r.gmv;
      d.totalDurationH += r.duration_h;
      if (r.is_double) d.doubleSessions += 1;
    }
  }
  const hostRank: HostDatum[] = Array.from(hostMap.values()).map((d) => ({
    ...d,
    avgGmv: d.sessions ? d.totalGmv / d.sessions : 0,
    gmvPerHour: d.totalDurationH ? d.totalGmv / d.totalDurationH : 0,
    refundRate: (() => {
      // 该主播参与的场次总退款/总GMV
      let g = 0;
      let rf = 0;
      for (const r of sel) {
        if ((r.hosts || []).includes(d.name)) {
          g += r.gmv;
          rf += r.refund_amt;
        }
      }
      return g ? rf / g : 0;
    })(),
  }));

  // 主播×时段（Top10 by 总GMV）
  const top10 = [...hostRank].sort((a, b) => b.totalGmv - a.totalGmv).slice(0, 10);
  const crossTop10 = top10.map((h) => {
    const rows = SLOTS.map((slot) => {
      const list = sel.filter((r) => (r.hosts || []).includes(h.name) && r.slot === slot);
      const g = sum(list.map((r) => r.gmv));
      return {
        slot,
        sessions: list.length,
        gmv: g,
        gmvShare: 0,
        gpm: mean(list.filter((r) => r.gpm != null).map((r) => r.gpm as number)),
        refundRate: g ? sum(list.map((r) => r.refund_amt)) / g : 0,
        avgGmv: list.length ? g / list.length : 0,
        sampleSmall: list.length < SAMPLE_LOW,
        alert: false,
      };
    });
    return { name: h.name, totalGmv: h.totalGmv, rows };
  });

  // 超大场
  const bigSessions = sel
    .filter((r) => r.gmv > BIG_GMV_THRESHOLD)
    .map((r) => ({
      date: r.date,
      hosts: r.hosts || [],
      startHour: r.start_hour,
      gmv: r.gmv,
      isDouble: r.is_double,
    }))
    .sort((a, b) => b.gmv - a.gmv);

  // 双播 vs 常规（常规=非双播且有主播；双播=is_double）
  const doubleList = sel.filter((r) => r.is_double);
  const soloList = sel.filter((r) => !r.is_double && (r.hosts || []).length > 0);
  const ds = {
    sessions: doubleList.length,
    gmv: sum(doubleList.map((r) => r.gmv)),
    refundRate: (() => {
      const g = sum(doubleList.map((r) => r.gmv));
      return g ? sum(doubleList.map((r) => r.refund_amt)) / g : 0;
    })(),
  };
  const ss = {
    sessions: soloList.length,
    gmv: sum(soloList.map((r) => r.gmv)),
    refundRate: (() => {
      const g = sum(soloList.map((r) => r.gmv));
      return g ? sum(soloList.map((r) => r.refund_amt)) / g : 0;
    })(),
  };
  const doubleVsSolo = {
    double: { ...ds, avgGmv: ds.sessions ? ds.gmv / ds.sessions : 0, view: sum(doubleList.map((r) => r.view_persons || 0)) },
    solo: { ...ss, avgGmv: ss.sessions ? ss.gmv / ss.sessions : 0, view: sum(soloList.map((r) => r.view_persons || 0)) },
    ratioSessions: ss.sessions && ds.sessions ? ss.sessions / ds.sessions : 0,
    ratioAvgGmv: (ss.sessions ? ss.gmv / ss.sessions : 0) ? (ds.sessions ? ds.gmv / ds.sessions : 0) / (ss.sessions ? ss.gmv / ss.sessions : 0) : 0,
  };

  const insights = buildInsights({ kpi, slots, hostRank, doubleVsSolo, durationEff, totalView, totalDeal, sessions });

  const flags = {
    dateInvalid: sel.filter((r) => !r.date_valid).length,
    negSettle: sel.filter((r) => r.neg_settle).length,
    reconBad: sel.filter((r) => r.recon_bad).length,
    peakDup401700: sel.filter((r) => r.peak_dup_401700).length,
    bigSessionsCount: kpi.bigSessionsCount,
    maxGmv: bigSessions.length ? bigSessions[0].gmv : 0,
  };

  return {
    filters: {
      start: filter.start || '',
      end: filter.end || '',
      host: filter.host || '',
      slot: filter.slot || '',
      today: referenceToday(),
    },
    totals: { sessions, dateInvalid, timeFail, durationH: totalDurationH },
    kpi,
    slots,
    hourDist,
    durationEff,
    hostRank,
    crossTop10,
    bigSessions,
    doubleVsSolo,
    insights,
    flags,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const w = (x: number) => (x >= 100000000 ? `${(x / 100000000).toFixed(2)}亿` : x >= 10000 ? `${round1(x / 10000)}万` : `${round1(x)}`);

function buildInsights(p: {
  kpi: AnalysisPayload['kpi'];
  slots: SlotDatum[];
  hostRank: HostDatum[];
  doubleVsSolo: AnalysisPayload['doubleVsSolo'];
  durationEff: AnalysisPayload['durationEff'];
  totalView: number;
  totalDeal: number;
  sessions: number;
}): Insight[] {
  const { kpi, slots, hostRank, doubleVsSolo, durationEff, sessions } = p;
  const topShape = [...hostRank].sort((a, b) => b.totalGmv - a.totalGmv);
  const topHost = topShape[0];
  const topEff = [...hostRank].sort((a, b) => b.gmvPerHour - a.gmvPerHour)[0];
  const highRefund = [...hostRank].sort((a, b) => b.refundRate - a.refundRate);
  const slotShare = [...slots].sort((a, b) => b.gmv - a.gmv)[0];
  const eff442 = [...durationEff].sort((a, b) => b.gmvPerSession - a.gmvPerSession);

  const arr: Insight[] = [
    {
      dimension: '排班优化',
      title: '时段与时长维度',
      body: `全日总时长 ${round1(kpi.totalDurationH)}h、共 ${sessions} 场，场均 ${round1(kpi.gmvPerSession)}GMV。GMV 占比最高的时档为「${slotShare.slot}」（${w(slotShare.gmv)}，占 ${pct(slotShare.gmvShare)}），建议把核心时段资源向高占比档倾斜。时长分组中场均 GMV 最高的是「${eff442[0]?.label}」（场均 ${w(
        eff442[0]?.gmvPerSession || 0
      )}），排班可优先匹配该时长带。`,
    },
    {
      dimension: '主播培养',
      title: '主播贡献分层',
      body: `贡献最高主播为「${topHost?.name}」（总GMV ${w(topHost?.totalGmv || 0)} / ${topHost?.sessions}场）；时效表现最好的是「${topEff?.name}」（GMV÷时长 ${round1(
        topEff?.gmvPerHour || 0
      )}/h）。建议对高时效主播增加时段资源，并对中腰部主播做针对性培养。`,
    },
    {
      dimension: '退款率治理',
      title: '退款风险',
      body: `退款率最高主播为「${highRefund[0]?.name}」（${pct(highRefund[0]?.refundRate || 0)}）；其中「凌晨」档综合退款率 ${pct(
        slots.find((s) => s.slot === '凌晨')?.refundRate || 0
      )}、晚间档 ${pct(slots.find((s) => s.slot === '晚间')?.refundRate || 0)}，属真实高值，需专项治理。`,
    },
    {
      dimension: '双播策略',
      title: '双播 vs 常规',
      body:
        doubleVsSolo.double.sessions || doubleVsSolo.solo.sessions
          ? `双播 ${doubleVsSolo.double.sessions} 场，场均GMV ${w(doubleVsSolo.double.avgGmv)}（${pct(doubleVsSolo.double.refundRate)}退款）；常规 ${doubleVsSolo.solo.sessions} 场，场均 ${w(
              doubleVsSolo.solo.avgGmv
            )}（${pct(doubleVsSolo.solo.refundRate)}退款）。双播场均约为常规的 ${round1(doubleVsSolo.ratioAvgGmv)} 倍，建议把高价值主播组合梯次排入双播。`
          : '当前筛选下无双播数据。',
    },
  ];
  return arr;
}

// Q&A: 简单规则解析，返回结构化结论
export function answerQuestion(q: string): {
  type: string;
  title: string;
  body: string;
  rows?: { label: string; value: string }[];
} {
  const hosts = allHosts();
  const qq = q.trim();
  const found = hosts.filter((h) => qq.includes(h));
  const isCompare = /(对比|比较|vs|和.*比|pk)/i.test(qq);
  const isRefundRank = /(退款率|退款).*?(排行|排名|top|最高|最低)/i.test(qq) || /(排行|排名).*?退款/i.test(qq);
  const isSlot = SLOTS.filter((s) => qq.includes(s));
  const isDouble = /(双播|连麦|组合)/.test(qq);

  // 双播参与场次
  if (found.length === 1 && isDouble && !isCompare) {
    const h = found[0];
    const d = RECORDS.filter((r) => r.is_double && (r.hosts || []).includes(h));
    return {
      type: 'host_double_sessions',
      title: `${h} 双播参与场次`,
      body: `${h} 共参与 ${d.length} 场双播，合计 GMV ${w(sum(d.map((r) => r.gmv)))}，场均 ${w(mean(d.map((r) => r.gmv)))}。`,
    };
  }

  // 主播间对比
  if (isCompare && found.length >= 2) {
    const rows = found.slice(0, 2).map((h) => {
      const list = RECORDS.filter((r) => (r.hosts || []).includes(h));
      const g = sum(list.map((r) => r.gmv));
      const rf = sum(list.map((r) => r.refund_amt));
      const dur = sum(list.map((r) => r.duration_h));
      return {
        label: h,
        value: `${list.length}场 / GMV ${w(g)} / 场均 ${w(list.length ? g / list.length : 0)} / 时效 ${round1(dur ? g / dur : 0)}/h / 退款率 ${pct(
          g ? rf / g : 0
        )}`,
      };
    });
    const a = found[0];
    const b = found[1];
    const la = RECORDS.filter((r) => (r.hosts || []).includes(a));
    const lb = RECORDS.filter((r) => (r.hosts || []).includes(b));
    const ga = sum(la.map((r) => r.gmv));
    const gb = sum(lb.map((r) => r.gmv));
    const leader = ga >= gb ? a : b;
    const diff = Math.max(ga, gb) - Math.min(ga, gb);
    return {
      type: 'host_compare',
      title: `${a} ⇆ ${b} 对比`,
      body: `${leader} 在总GMV上领先 ${w(diff)}（${a} ${w(ga)} vs ${b} ${w(gb)}）。`,
      rows,
    };
  }

  // 退款率排行
  if (isRefundRank) {
    const rows = [...hostRankRank()]
      .slice(0, 5)
      .map((d) => ({ label: d.name, value: `${pct(d.refundRate)} / ${d.sessions}场 / GMV ${w(d.totalGmv)}` }));
    return {
      type: 'refund_rank',
      title: '退款率排行 Top5',
      body: '按退款率(总退款/总GMV)从高到低：',
      rows,
    };
  }

  // 时段查询
  if (isSlot.length) {
    const s = isSlot[0];
    const list = RECORDS.filter((r) => r.slot === s);
    const g = sum(list.map((r) => r.gmv));
    const rf = sum(list.map((r) => r.refund_amt));
    return {
      type: 'slot_query',
      title: `${s}档查询`,
      body: `${s}档共 ${list.length} 场，GMV ${w(g)}（占比 ${pct(g / (sum(RECORDS.map((r) => r.gmv)) || 1))}），退款率 ${pct(g ? rf / g : 0)}。`,
    };
  }

  // 双播 vs 常规
  if (isDouble && !found.length) {
    const d = RECORDS.filter((r) => r.is_double);
    const s = RECORDS.filter((r) => !r.is_double && (r.hosts || []).length > 0);
    const dg = sum(d.map((r) => r.gmv));
    const sg = sum(s.map((r) => r.gmv));
    return {
      type: 'double_vs_solo',
      title: '双播 vs 常规',
      body: `双播 ${d.length} 场、总GMV ${w(dg)}、场均 ${w(d.length ? dg / d.length : 0)}；常规 ${s.length} 场、总GMV ${w(sg)}、场均 ${w(
        s.length ? sg / s.length : 0
      )}。双播场均约为常规 ${round1((s.length ? sg / s.length : 0) ? dg / d.length / (sg / s.length) : 0)} 倍。`,
    };
  }

  // 单主播概览
  if (found.length === 1) {
    const h = found[0];
    const list = RECORDS.filter((r) => (r.hosts || []).includes(h));
    const g = sum(list.map((r) => r.gmv));
    const rf = sum(list.map((r) => r.refund_amt));
    const dur = sum(list.map((r) => r.duration_h));
    return {
      type: 'host_overview',
      title: `${h} 数据概览`,
      body: `${h} 参与 ${list.length} 场，总GMV ${w(g)}、场均 ${w(list.length ? g / list.length : 0)}、总时长 ${round1(dur)}h、时效 ${round1(
        dur ? g / dur : 0
      )}/h、退款率 ${pct(g ? rf / g : 0)}、双播 ${list.filter((r) => r.is_double).length} 场。`,
    };
  }

  // 时段 vs 双播等未命中 → 引导
  return {
    type: 'guide',
    title: '未识别问题',
    body: '请尝试输入以下问题：主播间对比（如"漫漫 vs 芙芙"）、退款率排行、某时段查询（如"凌晨"）、双播 vs 常规、某主播双播参与场次（如"漫漫 双播几场"）、单主播数据概览（如"漫漫"）。',
  };
}

function hostRankRank(): HostDatum[] {
  const map = new Map<string, HostDatum>();
  for (const r of RECORDS) {
    for (const h of r.hosts || []) {
      let d = map.get(h);
      if (!d) {
        d = { name: h, sessions: 0, totalGmv: 0, avgGmv: 0, gmvPerHour: 0, refundRate: 0, doubleSessions: 0, totalDurationH: 0 };
        map.set(h, d);
      }
      d.sessions += 1;
      d.totalGmv += r.gmv;
      d.totalDurationH += r.duration_h;
    }
  }
  return Array.from(map.values()).map((d) => {
    let g = 0;
    let rf = 0;
    for (const r of RECORDS) {
      if ((r.hosts || []).includes(d.name)) {
        g += r.gmv;
        rf += r.refund_amt;
      }
    }
    return { ...d, avgGmv: d.sessions ? d.totalGmv / d.sessions : 0, gmvPerHour: d.totalDurationH ? d.totalGmv / d.totalDurationH : 0, refundRate: g ? rf / g : 0 };
  });
}

export function emptyPayload(): AnalysisPayload {
  return {
    filters: { start: '', end: '', host: '', slot: '', today: referenceToday() },
    totals: { sessions: 0, dateInvalid: 0, timeFail: 0, durationH: 0 },
    kpi: {
      totalGmv: 0, gmvPerSession: 0, totalSettle: 0, settleRate: 0, totalRefund: 0, totalRefundRate: 0,
      totalView: 0, viewPerSession: 0, uvValue: 0, realUvValue: 0, totalDeal: 0, viewDealRate: 0, gpm: 0, totalDurationH: 0, bigSessionsCount: 0,
    },
    slots: SLOTS.map((slot) => ({ slot, sessions: 0, gmv: 0, gmvShare: 0, gpm: 0, refundRate: 0, alert: false })),
    hourDist: Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: 0, gmv: 0, flag: 0 })),
    durationEff: [
      { label: '≤2h', sessions: 0, gmv: 0, gmvPerSession: 0 },
      { label: '2-4h', sessions: 0, gmv: 0, gmvPerSession: 0 },
      { label: '4-6h', sessions: 0, gmv: 0, gmvPerSession: 0 },
      { label: '6h以上', sessions: 0, gmv: 0, gmvPerSession: 0 },
    ],
    hostRank: [],
    crossTop10: [],
    bigSessions: [],
    doubleVsSolo: {
      double: { sessions: 0, gmv: 0, avgGmv: 0, refundRate: 0, view: 0 },
      solo: { sessions: 0, gmv: 0, avgGmv: 0, refundRate: 0, view: 0 },
      ratioSessions: 0, ratioAvgGmv: 0,
    },
    insights: [],
    flags: { dateInvalid: 0, negSettle: 0, reconBad: 0, peakDup401700: 0, bigSessionsCount: 0, maxGmv: 0 },
  };
}

export { AGG };