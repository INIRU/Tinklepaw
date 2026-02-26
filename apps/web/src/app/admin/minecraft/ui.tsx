'use client';

import { useCallback, useEffect, useState } from 'react';
import { m } from 'framer-motion';
import {
  ChevronLeft,
  Gamepad2,
  RefreshCw,
  Save,
  Search,
  Users,
  ShoppingCart,
  ScrollText,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/toast/ToastProvider';

const motionProps = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type MinecraftJob = {
  job: string | null;
  level: number;
  xp: number;
};

type Player = {
  minecraft_uuid: string;
  discord_user_id: string;
  minecraft_name: string;
  linked_at: string;
  minecraft_jobs: MinecraftJob | MinecraftJob[] | null;
};

type MarketPrice = {
  current_price: number;
  change_pct: number;
  updated_at: string;
};

type MarketItem = {
  symbol: string;
  display_name: string;
  category: string;
  base_price: number;
  min_price: number;
  max_price: number;
  mc_material: string | null;
  enabled: boolean;
  mc_market_prices: MarketPrice | MarketPrice[] | null;
};

type Quest = {
  id: string;
  job_type: string | null;
  description: string;
  target_type: string;
  target_material: string | null;
  target_qty: number;
  reward_points: number;
};

type McConfig = {
  mc_market_fee_bps: number | null;
  mc_market_event_interval_ms: number | null;
  mc_market_channel_id: string | null;
  mc_job_change_cost_points: number | null;
  mc_freshness_decay_minutes: number | null;
  mc_purity_y_bonus_enabled: boolean | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJob(player: Player): MinecraftJob | null {
  if (!player.minecraft_jobs) return null;
  if (Array.isArray(player.minecraft_jobs)) return player.minecraft_jobs[0] ?? null;
  return player.minecraft_jobs;
}

function getPrice(item: MarketItem): MarketPrice | null {
  if (!item.mc_market_prices) return null;
  if (Array.isArray(item.mc_market_prices)) return item.mc_market_prices[0] ?? null;
  return item.mc_market_prices;
}

function jobLabel(job: string | null | undefined): string {
  if (!job) return '없음';
  if (job === 'miner') return '광부';
  if (job === 'farmer') return '농부';
  return job;
}

function categoryLabel(cat: string): string {
  if (cat === 'crop') return '작물';
  if (cat === 'mineral') return '광물';
  return cat;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse border-t border-[color:var(--border)]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded bg-[color:var(--chip)] w-3/4" />
        </td>
      ))}
    </tr>
  );
}

// ─── Tab: 플레이어 ─────────────────────────────────────────────────────────────

function PlayersTab() {
  const toast = useToast();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/minecraft/players', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as { players: Player[] };
      setPlayers(json.players);
    } catch {
      toast.error('플레이어 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { void load(false); }, [load]);

  const filtered = players.filter(
    (p) =>
      !search ||
      p.minecraft_name.toLowerCase().includes(search.toLowerCase()) ||
      p.discord_user_id.includes(search),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
          <input
            type="text"
            placeholder="이름 또는 Discord ID 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] pl-9 pr-3 py-1.5 text-sm w-64"
          />
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)] bg-[color:var(--chip)]/40">
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">마인크래프트 이름</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">Discord ID</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">직업</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">레벨</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">XP</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">연동일</th>
            </tr>
          </thead>
          <tbody className="bg-[color:var(--card)]/60">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : filtered.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[color:var(--muted)]">
                      {search ? '검색 결과가 없습니다.' : '연동된 플레이어가 없습니다.'}
                    </td>
                  </tr>
                )
                : filtered.map((p) => {
                  const job = getJob(p);
                  return (
                    <tr key={p.minecraft_uuid} className="border-t border-[color:var(--border)] hover:bg-[color:var(--chip)]/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-[color:var(--fg)]">{p.minecraft_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--muted)]">{p.discord_user_id}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-2 py-0.5 text-xs">
                          {jobLabel(job?.job)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[color:var(--fg)]">{job?.level ?? '-'}</td>
                      <td className="px-4 py-3 text-[color:var(--muted)]">{job?.xp ?? '-'}</td>
                      <td className="px-4 py-3 text-[color:var(--muted)]">{formatDate(p.linked_at)}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      {!loading && (
        <p className="text-xs text-[color:var(--muted)]">총 {filtered.length}명 표시 중 (최대 200명)</p>
      )}
    </div>
  );
}

// ─── Tab: 시장 ────────────────────────────────────────────────────────────────

type MarketRowEdit = {
  base_price: string;
  min_price: string;
  max_price: string;
};

function MarketTab() {
  const toast = useToast();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edits, setEdits] = useState<Record<string, MarketRowEdit>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/minecraft/market', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as { items: MarketItem[] };
      setItems(json.items);
      setEdits({});
    } catch {
      toast.error('시장 아이템을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { void load(false); }, [load]);

  const getEdit = (item: MarketItem): MarketRowEdit =>
    edits[item.symbol] ?? {
      base_price: String(item.base_price),
      min_price: String(item.min_price),
      max_price: String(item.max_price),
    };

  const setEdit = (symbol: string, field: keyof MarketRowEdit, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [symbol]: { ...(prev[symbol] ?? { base_price: '', min_price: '', max_price: '' }), [field]: value },
    }));
  };

  const saveRow = async (item: MarketItem) => {
    const e = getEdit(item);
    setSaving((prev) => ({ ...prev, [item.symbol]: true }));
    try {
      const res = await fetch('/api/admin/minecraft/market', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: item.symbol,
          base_price: Number(e.base_price),
          min_price: Number(e.min_price),
          max_price: Number(e.max_price),
        }),
      });
      if (!res.ok) throw new Error('patch failed');
      toast.success(`${item.display_name} 저장 완료`);
      setEdits((prev) => { const next = { ...prev }; delete next[item.symbol]; return next; });
      void load(true);
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving((prev) => ({ ...prev, [item.symbol]: false }));
    }
  };

  const toggleEnabled = async (item: MarketItem) => {
    setToggling((prev) => ({ ...prev, [item.symbol]: true }));
    try {
      const res = await fetch('/api/admin/minecraft/market', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: item.symbol, enabled: !item.enabled }),
      });
      if (!res.ok) throw new Error('patch failed');
      setItems((prev) => prev.map((it) => it.symbol === item.symbol ? { ...it, enabled: !it.enabled } : it));
    } catch {
      toast.error('상태 변경에 실패했습니다.');
    } finally {
      setToggling((prev) => ({ ...prev, [item.symbol]: false }));
    }
  };

  const grouped = items.reduce<Record<string, MarketItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {loading
        ? (
          <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--border)] bg-[color:var(--chip)]/40">
                  {['아이템', '현재가', '기준가', '최저', '최고', '활성', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-[color:var(--card)]/60">
                {Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} cols={7} />)}
              </tbody>
            </table>
          </div>
        )
        : Object.entries(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <h3 className="mb-2 text-xs font-bold tracking-widest text-[color:var(--accent-mint)] uppercase">
              {categoryLabel(cat)}
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--border)] bg-[color:var(--chip)]/40">
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">아이템</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">현재가</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">기준가</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">최저</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">최고</th>
                    <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">활성</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="bg-[color:var(--card)]/60">
                  {catItems.map((item) => {
                    const price = getPrice(item);
                    const e = getEdit(item);
                    const isDirty =
                      e.base_price !== String(item.base_price) ||
                      e.min_price !== String(item.min_price) ||
                      e.max_price !== String(item.max_price);
                    return (
                      <tr key={item.symbol} className="border-t border-[color:var(--border)] hover:bg-[color:var(--chip)]/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[color:var(--fg)]">{item.display_name}</div>
                          <div className="text-xs text-[color:var(--muted)]">{item.symbol}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[color:var(--accent-sky)]">
                          {price ? price.current_price.toLocaleString('ko-KR') : '-'}
                          {price && (
                            <span className={`ml-1 text-xs ${price.change_pct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {price.change_pct >= 0 ? '+' : ''}{price.change_pct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={e.base_price}
                            onChange={(ev) => setEdit(item.symbol, 'base_price', ev.target.value)}
                            className="w-24 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={e.min_price}
                            onChange={(ev) => setEdit(item.symbol, 'min_price', ev.target.value)}
                            className="w-24 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={e.max_price}
                            onChange={(ev) => setEdit(item.symbol, 'max_price', ev.target.value)}
                            className="w-24 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            disabled={toggling[item.symbol]}
                            onClick={() => void toggleEnabled(item)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-60 ${item.enabled ? 'bg-[color:var(--accent-mint)]' : 'bg-[color:var(--chip)]'}`}
                            aria-label={item.enabled ? '비활성화' : '활성화'}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.enabled ? 'translate-x-4' : 'translate-x-1'}`}
                            />
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          {isDirty && (
                            <button
                              type="button"
                              disabled={saving[item.symbol]}
                              onClick={() => void saveRow(item)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
                            >
                              {saving[item.symbol]
                                ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                : <Save className="h-3.5 w-3.5" />
                              }
                              저장
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </div>
  );
}

// ─── Tab: 퀘스트 ──────────────────────────────────────────────────────────────

type QuestRowEdit = {
  target_qty: string;
  reward_points: string;
};

function QuestsTab() {
  const toast = useToast();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edits, setEdits] = useState<Record<string, QuestRowEdit>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/minecraft/quests', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as { quests: Quest[] };
      setQuests(json.quests);
      setEdits({});
    } catch {
      toast.error('퀘스트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { void load(false); }, [load]);

  const getEdit = (q: Quest): QuestRowEdit =>
    edits[q.id] ?? { target_qty: String(q.target_qty), reward_points: String(q.reward_points) };

  const setEdit = (id: string, field: keyof QuestRowEdit, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { target_qty: '', reward_points: '' }), [field]: value },
    }));
  };

  const saveRow = async (q: Quest) => {
    const e = getEdit(q);
    setSaving((prev) => ({ ...prev, [q.id]: true }));
    try {
      const res = await fetch('/api/admin/minecraft/quests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: q.id,
          target_qty: Number(e.target_qty),
          reward_points: Number(e.reward_points),
        }),
      });
      if (!res.ok) throw new Error('patch failed');
      toast.success('퀘스트 저장 완료');
      setEdits((prev) => { const next = { ...prev }; delete next[q.id]; return next; });
      void load(true);
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[color:var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--border)] bg-[color:var(--chip)]/40">
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">직업</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">설명</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">목표</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">목표수량</th>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--muted)]">보상</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="bg-[color:var(--card)]/60">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} cols={7} />)
              : quests.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[color:var(--muted)]">퀘스트가 없습니다.</td>
                  </tr>
                )
                : quests.map((q) => {
                  const e = getEdit(q);
                  const isDirty =
                    e.target_qty !== String(q.target_qty) ||
                    e.reward_points !== String(q.reward_points);
                  return (
                    <tr key={q.id} className="border-t border-[color:var(--border)] hover:bg-[color:var(--chip)]/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--muted)]">{q.id.slice(0, 8)}…</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-2 py-0.5 text-xs">
                          {jobLabel(q.job_type) === '없음' ? '공통' : jobLabel(q.job_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="line-clamp-2 text-[color:var(--fg)]">{q.description}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[color:var(--muted)]">
                        <div>{q.target_type}</div>
                        {q.target_material && <div className="font-mono">{q.target_material}</div>}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={e.target_qty}
                          onChange={(ev) => setEdit(q.id, 'target_qty', ev.target.value)}
                          className="w-20 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={e.reward_points}
                            onChange={(ev) => setEdit(q.id, 'reward_points', ev.target.value)}
                            className="w-20 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
                          />
                          <span className="text-xs text-[color:var(--muted)]">P</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {isDirty && (
                          <button
                            type="button"
                            disabled={saving[q.id]}
                            onClick={() => void saveRow(q)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
                          >
                            {saving[q.id]
                              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              : <Save className="h-3.5 w-3.5" />
                            }
                            저장
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: 설정 ────────────────────────────────────────────────────────────────

function ConfigTab() {
  const toast = useToast();
  const [config, setConfig] = useState<McConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<McConfig>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/minecraft/config', { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      const json = await res.json() as McConfig;
      setConfig(json);
      setForm(json);
    } catch {
      toast.error('설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/minecraft/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('put failed');
      toast.success('설정 저장 완료');
      void load();
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4">
            <div className="h-3 w-40 rounded bg-[color:var(--chip)] mb-3" />
            <div className="h-9 w-full rounded-lg bg-[color:var(--chip)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 block">
          <div className="text-xs font-semibold text-[color:var(--muted)] mb-1">거래 수수료 (bps)</div>
          <div className="text-[11px] text-[color:var(--muted)] mb-2">500 = 5%</div>
          <input
            type="number"
            value={form.mc_market_fee_bps ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, mc_market_fee_bps: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
          />
        </label>

        <label className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 block">
          <div className="text-xs font-semibold text-[color:var(--muted)] mb-3">시장 이벤트 주기 (ms)</div>
          <input
            type="number"
            value={form.mc_market_event_interval_ms ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, mc_market_event_interval_ms: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
          />
        </label>

        <label className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 block">
          <div className="text-xs font-semibold text-[color:var(--muted)] mb-3">시장 이벤트 Discord 채널 ID</div>
          <input
            type="text"
            value={form.mc_market_channel_id ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, mc_market_channel_id: e.target.value || null }))}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm font-mono"
            placeholder="채널 ID"
          />
        </label>

        <label className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 block">
          <div className="text-xs font-semibold text-[color:var(--muted)] mb-3">직업 변경 비용 (P)</div>
          <input
            type="number"
            value={form.mc_job_change_cost_points ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, mc_job_change_cost_points: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
          />
        </label>

        <label className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 block">
          <div className="text-xs font-semibold text-[color:var(--muted)] mb-3">작물 신선도 감소 시간 (분)</div>
          <input
            type="number"
            value={form.mc_freshness_decay_minutes ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, mc_freshness_decay_minutes: Number(e.target.value) }))}
            className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1.5 text-sm"
          />
        </label>

        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[color:var(--muted)]">Y좌표 순정도 보너스</div>
            <div className="text-[11px] text-[color:var(--muted)] mt-0.5">채굴 Y좌표에 따라 순정도 보너스 적용</div>
          </div>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, mc_purity_y_bonus_enabled: !p.mc_purity_y_bonus_enabled }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.mc_purity_y_bonus_enabled ? 'bg-[color:var(--accent-mint)]' : 'bg-[color:var(--chip)]'}`}
            aria-label="Y좌표 순정도 보너스 토글"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.mc_purity_y_bonus_enabled ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={saving || loading || config === null}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-4 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'players' as const, label: '플레이어', icon: Users },
  { id: 'market' as const, label: '시장', icon: ShoppingCart },
  { id: 'quests' as const, label: '퀘스트', icon: ScrollText },
  { id: 'config' as const, label: '설정', icon: Settings },
];

export default function MinecraftAdminClient() {
  const [activeTab, setActiveTab] = useState<'players' | 'market' | 'quests' | 'config'>('players');

  return (
    <main className="p-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Hero */}
        <m.section {...motionProps} className="relative overflow-hidden rounded-[30px] card-glass p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_400px_at_90%_0%,rgba(57,211,179,0.15),transparent_58%)]" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[color:var(--accent-mint)]/10 blur-3xl" />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-mint)] opacity-80">MINECRAFT</div>
              <h1 className="mt-3 text-4xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">마인크래프트 관리</h1>
              <p className="mt-2 max-w-2xl text-sm muted">플레이어 연동, 시장 아이템, 퀘스트, 서버 설정을 관리합니다.</p>
            </div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80"
            >
              <ChevronLeft className="h-4 w-4" />
              관리자 홈
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1 inline-flex items-center gap-1.5">
              <Gamepad2 className="h-3.5 w-3.5" />
              마인크래프트 서버 연동
            </span>
          </div>
        </m.section>

        {/* Tabs */}
        <m.section {...motionProps} transition={{ ...motionProps.transition, delay: 0.05 }}>
          <div className="flex gap-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/60 p-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-[color:var(--surface)] text-[color:var(--fg)] shadow-sm border border-[color:var(--border)]'
                      : 'text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--chip)]/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </m.section>

        {/* Tab Content */}
        <m.section {...motionProps} transition={{ ...motionProps.transition, delay: 0.08 }}>
          {activeTab === 'players' && <PlayersTab />}
          {activeTab === 'market' && <MarketTab />}
          {activeTab === 'quests' && <QuestsTab />}
          {activeTab === 'config' && <ConfigTab />}
        </m.section>
      </div>
    </main>
  );
}
