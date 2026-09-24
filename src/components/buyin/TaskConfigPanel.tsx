'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BUYIN_GRANULARITIES,
  BUYIN_CATS,
  BUYIN_FIELDS,
  supportedFields,
  groupFieldsByCat,
  GRANULARITY_NOTES,
  type BuyinGranularity,
} from '@/lib/data/buyin-fields';

interface TaskResp {
  id: string;
  name: string;
  by_kol_id: string | null;
  by_account: string | null;
  granularities: string[];
  selected_fields: string[];
  with_product_detail: boolean;
  lookback_days: number;
  frequency: string;
  interval_days: number | null;
  run_time: string | null;
  delivery_target_type: string;
  delivery_feishu_token: string | null;
  delivery_feishu_url: string | null;
  delivery_auto_create: boolean;
  one_sheet_per_type: boolean;
  write_mode: string;
  enabled: boolean;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

const FREQUENCIES: { key: string; label: string }[] = [
  { key: 'daily', label: '每天' },
  { key: 'weekly', label: '每周' },
  { key: 'custom', label: '自定义间隔（天）' },
  { key: 'manual', label: '仅手动' },
];

export default function TaskConfigPanel({ loggedIn }: { loggedIn: boolean }) {
  const [name, setName] = useState('');
  const [kolId, setKolId] = useState('');
  const [account, setAccount] = useState('');
  const [grans, setGrans] = useState<BuyinGranularity[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [withPd, setWithPd] = useState(false);
  const [lookback, setLookback] = useState(1);
  const [frequency, setFrequency] = useState('daily');
  const [intervalDays, setIntervalDays] = useState(7);
  const [runTime, setRunTime] = useState('10:00');
  const [autoCreate, setAutoCreate] = useState(false);
  const [feishuToken, setFeishuToken] = useState('');
  const [oneSheet, setOneSheet] = useState(true);
  const [writeMode, setWriteMode] = useState('append');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskResp[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const supported = useMemo<BuyinGranularity[]>(() => grans, [grans]);
  const supportedFieldsList = useMemo(() => supportedFields(supported), [supported]);
  const grouped = useMemo(() => groupFieldsByCat(supportedFieldsList, BUYIN_CATS), [supportedFieldsList]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const loadTasks = useCallback(async () => {
    try {
      const d = (await (await fetch('/api/buyin-spike/tasks')).json()) as { success: boolean; tasks: TaskResp[] };
      if (d.success) setTasks(d.tasks ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (loggedIn) void loadTasks();
  }, [loggedIn, loadTasks]);

  // 保存/回显时按 FIELD 源顺序输出已选字段
  const orderedSelected = useMemo(
    () => BUYIN_FIELDS.map((f) => f.field).filter((f) => selectedSet.has(f)),
    [selectedSet],
  );

  const resetMsg = () => setMsg(null);

  function toggleGran(g: BuyinGranularity) {
    resetMsg();
    setGrans((prev) => {
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      const sup = new Set(supportedFields(next).map((f) => f.field));
      setSelected((s) => s.filter((f) => sup.has(f)));
      return next;
    });
  }

  function toggleField(field: string) {
    resetMsg();
    setSelected((s) => (s.includes(field) ? s.filter((f) => f !== field) : [...s, field]));
  }

  function toggleCat(cat: string) {
    resetMsg();
    const catFields = supportedFieldsList.filter((f) => f.cat === cat).map((f) => f.field);
    const allIn = catFields.every((f) => selectedSet.has(f));
    setSelected((s) => {
      if (allIn) return s.filter((f) => !catFields.includes(f));
      const merged = new Set(s);
      catFields.forEach((f) => merged.add(f));
      return Array.from(merged);
    });
  }

  function toggleAll() {
    resetMsg();
    const all = supportedFieldsList.map((f) => f.field);
    const allIn = all.every((f) => selectedSet.has(f));
    setSelected(allIn ? [] : all);
  }

  function fillForm(t: TaskResp) {
    ctxformToState(t);
  }

  function ctxformToState(t: TaskResp) {
    setName(t.name || '');
    setKolId(t.by_kol_id || '');
    setAccount(t.by_account || '');
    const g = (t.granularities || []).filter(
      (x): x is BuyinGranularity => ['day', 'hour', 'product', 'anchor'].includes(x),
    );
    setGrans(g);
    const sup = new Set(supportedFields(g).map((f) => f.field));
    setSelected((t.selected_fields || []).filter((f) => sup.has(f)));
    setWithPd(Boolean(t.with_product_detail));
    setLookback(t.lookback_days ?? 1);
    setFrequency(t.frequency || 'daily');
    setIntervalDays(t.interval_days ?? 7);
    setRunTime(t.run_time || '10:00');
    setAutoCreate(Boolean(t.delivery_auto_create));
    setFeishuToken(t.delivery_feishu_token || '');
    setOneSheet(t.one_sheet_per_type !== false);
    setWriteMode(t.write_mode === 'overwrite' ? 'overwrite' : 'append');
    resetMsg();
  }

  function resetForm() {
    setName('');
    setKolId('');
    setAccount('');
    setGrans([]);
    setSelected([]);
    setWithPd(false);
    setLookback(1);
    setFrequency('daily');
    setIntervalDays(7);
    setRunTime('10:00');
    setAutoCreate(false);
    setFeishuToken('');
    setOneSheet(true);
    setWriteMode('append');
    setEditingId(null);
    resetMsg();
  }

  async function save() {
    resetMsg();
    if (!name.trim()) return setMsg('任务名称不能为空');
    if (grans.length === 0) return setMsg('至少选择一个数据粒度');
    if (orderedSelected.length === 0) return setMsg('至少选择一个指标字段');
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        by_kol_id: kolId.trim() || null,
        by_account: account.trim() || null,
        granularities: grans,
        selected_fields: orderedSelected,
        with_product_detail: withPd,
        lookback_days: lookback,
        frequency,
        interval_days: frequency === 'custom' ? intervalDays : null,
        run_time: runTime || null,
        delivery_auto_create: autoCreate,
        delivery_feishu_token: autoCreate ? null : feishuToken.trim() || null,
        one_sheet_per_type: oneSheet,
        write_mode: writeMode,
      };
      let d: { success: boolean; error?: string };
      if (editingId) {
        d = (await (
          await fetch(`/api/buyin-spike/tasks/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).json()) as { success: boolean; error?: string };
      } else {
        d = (await (
          await fetch('/api/buyin-spike/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).json()) as { success: boolean; error?: string };
      }
      if (d.success) {
        setMsg(editingId ? '任务已更新' : '任务已保存');
        resetForm();
        await loadTasks();
      } else {
        setMsg(d.error || '保存失败');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(t: TaskResp) {
    try {
      await fetch(`/api/buyin-spike/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle_enabled: true, enabled: !t.enabled }),
      });
      await loadTasks();
    } catch {
      /* ignore */
    }
  }

  async function doDelete(id: string) {
    try {
      await fetch(`/api/buyin-spike/tasks/${id}`, { method: 'DELETE' });
      setConfirmingDelete(null);
      if (editingId === id) resetForm();
      await loadTasks();
    } catch {
      /* ignore */
    }
  }

  const inputCls =
    'rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary';
  const labelCls = 'mb-1 block text-sm font-medium';

  return (
    <div className="space-y-6">
      {!loggedIn && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          请先在上方「连接百应」并扫码登录成功后，再配置采集任务。
        </div>
      )}

      <fieldset disabled={!loggedIn} className="space-y-6 opacity-100 disabled:opacity-50">
        {/* 1 任务名称 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>任务名称</label>
            <input className={inputCls + ' w-full'} value={name} placeholder="如：vivo 每日核心指标" onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={labelCls}>账号 / 达人（默认 vivo 官方旗舰店）</label>
            <input className={inputCls + ' w-full'} value={kolId} placeholder="达人ID by_kol_id（可留空）" onChange={(e) => setKolId(e.target.value)} />
            <input className={inputCls + ' w-full'} value={account} placeholder="账号名 by_account（可留空）" onChange={(e) => setAccount(e.target.value)} />
          </div>
        </div>

        {/* 3 数据粒度 */}
        <div>
          <label className={labelCls}>数据粒度（可多选）</label>
          <div className="flex flex-wrap gap-2">
            {BUYIN_GRANULARITIES.map((g) => (
              <label
                key={g.key}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition ${
                  grans.includes(g.key) ? 'border-primary bg-primary/10 text-foreground' : 'border-border'
                }`}
              >
                <input type="checkbox" className="accent-primary" checked={grans.includes(g.key)} onChange={() => toggleGran(g.key)} />
                {g.label}
              </label>
            ))}
          </div>
          {grans.map((g) => {
            const note = GRANULARITY_NOTES[g];
            return note ? <p key={g} className="mt-2 text-xs text-muted-foreground">{note}</p> : null;
          })}
        </div>

        {/* 4 指标列 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">指标列（按大类勾选，仅展示当前粒度支持的字段）</label>
            {grans.length > 0 && (
              <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
                {supportedFieldsList.length > 0 && supportedFieldsList.every((f) => selectedSet.has(f.field)) ? '清空全选' : '全选'}
              </button>
            )}
          </div>
          {grans.length === 0 ? (
            <p className="text-sm text-muted-foreground">先选择数据粒度后展示可用指标。</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(({ cat, fields }) =>
                fields.length === 0 ? null : (
                  <div key={cat} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">{cat}</span>
                      <button type="button" onClick={() => toggleCat(cat)} className="text-xs text-primary hover:underline">
                        {fields.every((f) => selectedSet.has(f.field)) ? '清空' : '全选'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {fields.map((f) => (
                        <label key={f.field} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" className="accent-primary" checked={selectedSet.has(f.field)} onChange={() => toggleField(f.field)} />
                          <span>{f.cn}</span>
                          <span className="text-xs text-muted-foreground">{f.field}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
          {orderedSelected.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">已选 {orderedSelected.length} 个指标，将按源顺序作为输出列。</p>
          )}
        </div>

        {/* 5 商品明细 */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div>
            <p className="text-sm font-medium">商品明细（with-product-detail）</p>
            <p className="text-xs text-muted-foreground">仅在勾选「商品」粒度时可用；请求量约为普通采集合倍数。</p>
          </div>
          <input
            type="checkbox"
            className="accent-primary"
            checked={withPd}
            disabled={!grans.includes('product')}
            onChange={(e) => setWithPd(e.target.checked)}
          />
        </div>

        {/* 6 数据窗口 */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>每次采集回溯天数</label>
            <input type="number" min={1} className={inputCls + ' w-full'} value={lookback} onChange={(e) => setLookback(Number(e.target.value))} />
          </div>
          <div>
            <label className={labelCls}>获取频率</label>
            <select className={inputCls + ' w-full'} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQUENCIES.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          {frequency === 'custom' && (
            <div>
              <label className={labelCls}>自定义间隔（天）</label>
              <input type="number" min={1} className={inputCls + ' w-full'} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} />
            </div>
          )}
          <div>
            <label className={labelCls}>获取时间</label>
            <input type="time" className={inputCls + ' w-full'} value={runTime} onChange={(e) => setRunTime(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">建议早上采前一日（跨零点归属与 T+ 回调）。</p>
          </div>
        </div>

        {/* 9 交付 */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium">飞书表格交付（方式固定为飞书电子表格）</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} />
              由系统自动新建表格（M4 交付阶段才真正写入，本阶段先存配置）
            </label>
            <input
              className={inputCls + ' w-full disabled:opacity-50'}
              disabled={autoCreate}
              placeholder="已有飞书表格链接 / Token"
              value={feishuToken}
              onChange={(e) => setFeishuToken(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-primary" checked={oneSheet} onChange={(e) => setOneSheet(e.target.checked)} />
              一个 data_type 一个 sheet
            </label>
            <div className="flex items-center gap-4">
              <span className="text-sm">写入模式：</span>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" className="accent-primary" checked={writeMode === 'append'} onChange={() => setWriteMode('append')} /> 追加
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input type="radio" className="accent-primary" checked={writeMode === 'overwrite'} onChange={() => setWriteMode('overwrite')} /> 覆盖
              </label>
              <span className="text-xs text-muted-foreground">按日期 + 粒度幂等去重。</span>
            </div>
          </div>
        </div>

        {/* 操作 */}
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition disabled:opacity-60"
          >
            {editingId ? '更新任务' : '保存任务'}
          </button>
          <button
            type="button"
            onClick={() => setMsg('调度执行将在下一阶段启用（M3 实现）')}
            className="rounded-md border border-border px-4 py-2 text-sm text-foreground"
          >
            立即执行一次
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              取消编辑
            </button>
          )}
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>

        {/* 已保存任务列表 */}
        {tasks.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">已保存任务</h3>
            <div className="space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={t.enabled ? 'font-medium' : 'font-medium text-muted-foreground'}>{t.name}</span>
                      {!t.enabled && <span className="text-xs text-muted-foreground">已停用</span>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {(t.by_account || t.by_kol_id || 'vivo 官方旗舰店')} · {t.granularities.join(' / ')} · {t.selected_fields.length} 指标 ·{' '}
                      {FREQUENCIES.find((f) => f.key === t.frequency)?.label ?? t.frequency}
                      {t.frequency === 'custom' && `（${t.interval_days}天）`}
                      {t.run_time ? ` · ${t.run_time}` : ''} · 交付 {t.delivery_auto_create ? '自动新建' : '指定表格'}
                      {t.delivery_feishu_token ? '（有Token）' : ''}
                      {t.creator_name ? ` · 创建人 ${t.creator_name}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={t.enabled}
                      title="启用 / 停用"
                      onChange={() => toggleEnabled(t)}
                    />
                    <button
                      onClick={() => {
                        fillForm(t);
                        setEditingId(t.id);
                        setMsg('编辑中…保存后生效');
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      编辑
                    </button>
                    {confirmingDelete === t.id ? (
                      <span className="flex items-center gap-1 text-xs">
                        <button onClick={() => doDelete(t.id)} className="text-red-500 hover:underline">
                          确认
                        </button>
                        <button onClick={() => setConfirmingDelete(null)} className="text-muted-foreground hover:underline">
                          取消
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmingDelete(t.id)} className="text-xs text-red-500 hover:underline">
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}