'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronDown, Dices, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { ImageCropModal } from '@/components/media/ImageCropModal';
import { ConfirmModal } from '@/components/modal/ConfirmModal';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Checkbox } from '@/components/ui/Checkbox';

type Role = { id: string; name: string };
type Item = {
  item_id: string;
  name: string;
  rarity: 'R' | 'S' | 'SS' | 'SSS';
  discord_role_id: string | null;
  is_active: boolean;
  duplicate_refund_points: number;
  reward_points: number;
};
type Pool = {
  pool_id: string;
  name: string;
  kind: 'permanent' | 'limited';
  is_active: boolean;
  banner_image_url: string | null;
  cost_points: number;
  paid_pull_cooldown_seconds: number;
  free_pull_interval_seconds: number | null;
  rate_r: number;
  rate_s: number;
  rate_ss: number;
  rate_sss: number;
  pity_threshold: number | null;
  pity_rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
  start_at?: string | null;
  end_at?: string | null;
};

const RARITIES: Array<Item['rarity']> = ['R', 'S', 'SS', 'SSS'];

const RATE_KEYS = ['rate_r', 'rate_s', 'rate_ss', 'rate_sss'] as const;
type RateKey = (typeof RATE_KEYS)[number];

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const safeNumber = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

const pad2 = (n: number) => String(n).padStart(2, '0');

const toDatetimeLocal = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const toIsoOrNull = (local: string) => {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function rebalanceRates(pool: Pool, changedKey: RateKey, rawValue: number): Pool {
  const next: Pool = { ...pool };
  const changedValue = round2(clamp(safeNumber(rawValue), 0, 100));
  next[changedKey] = changedValue as never;

  const otherKeys = RATE_KEYS.filter((k) => k !== changedKey);
  const desiredOtherSum = round2(100 - changedValue);

  if (desiredOtherSum <= 0) {
    for (const k of otherKeys) next[k] = 0 as never;
    return next;
  }

  const currentOtherSum = otherKeys.reduce((sum, k) => sum + safeNumber(next[k]), 0);
  if (currentOtherSum <= 0) {
    const per = desiredOtherSum / otherKeys.length;
    for (const k of otherKeys) next[k] = round2(per) as never;
  } else {
    const scale = desiredOtherSum / currentOtherSum;
    for (const k of otherKeys) next[k] = round2(safeNumber(next[k]) * scale) as never;
  }

  // Fix rounding drift without violating [0, 100].
  const sum = round2(RATE_KEYS.reduce((s, k) => s + safeNumber(next[k]), 0));
  let diff = round2(100 - sum);
  if (diff === 0) return next;

  const ordered = [...otherKeys].sort((a, b) =>
    diff < 0 ? safeNumber(next[b]) - safeNumber(next[a]) : safeNumber(next[a]) - safeNumber(next[b]),
  );

  for (const k of ordered) {
    if (diff === 0) break;
    const v = safeNumber(next[k]);
    const canAdd = round2(100 - v);
    const canSub = round2(v);
    const delta =
      diff > 0 ? Math.min(diff, canAdd) : Math.max(diff, -canSub);
    if (delta === 0) continue;
    next[k] = round2(v + delta) as never;
    diff = round2(diff - delta);
  }

  return next;
}

export default function GachaAdminClient() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [poolItems, setPoolItems] = useState<Set<string>>(new Set());
  const [autoBalanceRates, setAutoBalanceRates] = useState(true);

  const [simAmount, setSimAmount] = useState<number>(1000);
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<{
    n: number;
    pityForcedCount: number;
    rarityCounts: Record<Item['rarity'], number>;
    topItems: Array<{ itemId: string; name: string; rarity: Item['rarity']; count: number }>;
  } | null>(null);
  
  // Item Filters
  const [searchText, setSearchText] = useState('');
  const [filterRarity, setFilterRarity] = useState<string>('');
  const [filterInPool, setFilterInPool] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>('');

  const [bannerCrop, setBannerCrop] = useState<{
    poolId: string;
    srcUrl: string;
  } | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const pool = useMemo(() => pools.find((p) => p.pool_id === selectedPoolId) ?? null, [pools, selectedPoolId]);

  const simulate = useCallback(() => {
    if (!pool) return;
    const n = Math.max(1, Math.min(200_000, Math.floor(simAmount || 0)));

    const inPool = items.filter((it) => it.is_active && poolItems.has(it.item_id));
    const any = inPool.length > 0 ? inPool : items.filter((it) => it.is_active);

    const byRarity: Record<Item['rarity'], Item[]> = { R: [], S: [], SS: [], SSS: [] };
    for (const it of any) byRarity[it.rarity]?.push(it);

    const counts: Record<Item['rarity'], number> = { R: 0, S: 0, SS: 0, SSS: 0 };
    const itemCounts = new Map<string, { it: Item; count: number }>();

    const pityThreshold = pool.pity_threshold;
    const pityRarity = pool.pity_rarity as Item['rarity'] | null;
    let pityCounter = 0;
    let pityForcedCount = 0;

    for (let i = 0; i < n; i++) {
      let forcePity = false;
      let rarity: Item['rarity'];

      if (pityThreshold && pityRarity && pityCounter >= Math.max(pityThreshold - 1, 0)) {
        forcePity = true;
        rarity = pityRarity;
      } else {
        const roll = Math.random() * 100;
        if (roll <= pool.rate_r) rarity = 'R';
        else if (roll <= pool.rate_r + pool.rate_s) rarity = 'S';
        else if (roll <= pool.rate_r + pool.rate_s + pool.rate_ss) rarity = 'SS';
        else rarity = 'SSS';
      }

      const candidates = byRarity[rarity] ?? [];
      const picked =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : any.length > 0
            ? any[Math.floor(Math.random() * any.length)]
            : null;

      const finalRarity = (picked?.rarity ?? rarity) as Item['rarity'];
      counts[finalRarity] = (counts[finalRarity] ?? 0) + 1;

      if (picked) {
        const prev = itemCounts.get(picked.item_id);
        if (prev) prev.count += 1;
        else itemCounts.set(picked.item_id, { it: picked, count: 1 });
      }

      if (forcePity) pityForcedCount += 1;

      if (pityThreshold && pityRarity) {
        if (finalRarity === pityRarity) pityCounter = 0;
        else pityCounter += 1;
      }
    }

    const topItems = Array.from(itemCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ it, count }) => ({
        itemId: it.item_id,
        name: it.name,
        rarity: it.rarity,
        count,
      }));

    setSimResult({ n, pityForcedCount, rarityCounts: counts, topItems });
  }, [items, pool, poolItems, simAmount]);

  const refresh = useCallback(async () => {
    const [rRes, iRes, pRes] = await Promise.all([
      fetch('/api/admin/discord/roles'),
      fetch('/api/admin/gacha/items'),
      fetch('/api/admin/gacha/pools')
    ]);

    const rBody = (await rRes.json().catch(() => null)) as { roles?: Role[]; error?: string } | null;
    if (!rRes.ok) throw new Error(rBody?.error ?? `roles HTTP ${rRes.status}`);
    setRoles(rBody?.roles ?? []);

    const iBody = (await iRes.json().catch(() => null)) as { items?: Item[]; error?: string } | null;
    if (!iRes.ok) throw new Error(iBody?.error ?? `items HTTP ${iRes.status}`);
    setItems(iBody?.items ?? []);

    const pBody = (await pRes.json().catch(() => null)) as { pools?: Pool[]; error?: string } | null;
    if (!pRes.ok) throw new Error(pBody?.error ?? `pools HTTP ${pRes.status}`);
    const loadedPools = pBody?.pools ?? [];
    setPools(loadedPools);
    if (!selectedPoolId && loadedPools[0]) setSelectedPoolId(loadedPools[0].pool_id);
  }, [selectedPoolId]);

  const uploadPoolBanner = useCallback(
    async (poolId: string, file: File) => {
      try {
        setBannerUploading(true);
        const form = new FormData();
        form.set('poolId', poolId);
        form.set('file', file);
        const res = await fetch('/api/admin/gacha/pools/banner', { method: 'POST', body: form });
        const body = (await res.json().catch(() => null)) as { error?: string; publicUrl?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setPools((prev) => prev.map((p) => (p.pool_id === poolId ? { ...p, banner_image_url: body?.publicUrl ?? null } : p)));
        toast.success('배너가 저장되었습니다.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '배너 저장에 실패했습니다.');
      } finally {
        setBannerUploading(false);
      }
    },
    [toast]
  );

  const clearPoolBanner = useCallback(
    async (poolId: string) => {
      try {
        const res = await fetch(`/api/admin/gacha/pools/banner?poolId=${encodeURIComponent(poolId)}`, { method: 'DELETE' });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        setPools((prev) => prev.map((p) => (p.pool_id === poolId ? { ...p, banner_image_url: null } : p)));
        toast.success('배너가 제거되었습니다.', { durationMs: 2000 });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '배너 제거에 실패했습니다.');
      }
    },
    [toast]
  );

  useEffect(() => {
    refresh().catch((e) => toast.error(e instanceof Error ? e.message : '불러오지 못했습니다.'));
  }, [refresh, toast]);

  const saveItem = useCallback(async (item: Item) => {
    try {
      const res = await fetch('/api/admin/gacha/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await refresh();
      toast.success('아이템 저장이 완료되었습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '아이템 저장에 실패했습니다.');
    }
  }, [refresh, toast]);

  const togglePoolItem = useCallback(
    async (itemId: string, add: boolean) => {
      if (!selectedPoolId) return;
      setPoolItems((prev) => {
        const next = new Set(prev);
        if (add) next.add(itemId);
        else next.delete(itemId);
        return next;
      });

      try {
        await fetch('/api/admin/gacha/pool-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId: selectedPoolId, itemId, action: add ? 'add' : 'remove' })
        });
      } catch (error) {
        console.error('[AdminGacha] Failed to toggle pool item:', error);
        toast.error('변경 사항을 저장하지 못했습니다.');
      }
    },
    [selectedPoolId, toast]
  );

  useEffect(() => {
    if (selectedPoolId) {
      fetch(`/api/admin/gacha/pool-items?poolId=${selectedPoolId}`)
        .then((r) => r.json())
        .then((d) => setPoolItems(new Set(d.itemIds)))
        .catch((error) => console.error('[AdminGacha] Failed to load pool items:', error));
    } else {
      setPoolItems(new Set());
    }
  }, [selectedPoolId]);

  const savePool = useCallback(async (p: Pool) => {
    try {
      const res = await fetch('/api/admin/gacha/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await refresh();
      toast.success('풀 저장이 완료되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '풀 저장에 실패했습니다.';
      if (msg.includes('invalid input syntax')) {
        toast.error('DB 스키마 업데이트가 필요합니다. (현재 정수만 허용됨)');
      } else {
        toast.error(msg);
      }
    }
  }, [refresh, toast]);

  const createPool = useCallback(
    async (kind: Pool['kind']) => {
      try {
        const now = Date.now();
        const startAt = kind === 'limited' ? new Date(now).toISOString() : null;
        const endAt = kind === 'limited' ? new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
        const base: Omit<Pool, 'pool_id'> = {
          name: kind === 'permanent' ? '상시 뽑기' : '한정 뽑기',
          kind,
          is_active: true,
          banner_image_url: null,
          cost_points: 0,
          paid_pull_cooldown_seconds: 0,
          free_pull_interval_seconds: null,
          rate_r: 5,
          rate_s: 75,
          rate_ss: 17,
          rate_sss: 3,
          pity_threshold: null,
          pity_rarity: null,
          start_at: startAt,
          end_at: endAt
        };

        const res = await fetch('/api/admin/gacha/pools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(base)
        });
        const body = (await res.json().catch(() => null)) as { error?: string; pool?: Pool } | null;
        if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
        await refresh();
        if (body?.pool?.pool_id) setSelectedPoolId(body.pool.pool_id);
        toast.success('풀이 생성되었습니다.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '풀 생성에 실패했습니다.');
      }
    },
    [refresh, toast]
  );

  const deletePool = useCallback(
    async (poolId: string) => {
      setConfirmModal({
        isOpen: true,
        title: '풀 삭제',
        message: '정말 이 풀을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
        onConfirm: async () => {
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
          try {
            const res = await fetch(`/api/admin/gacha/pools?poolId=${encodeURIComponent(poolId)}`, { method: 'DELETE' });
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
            if (selectedPoolId === poolId) setSelectedPoolId('');
            await refresh();
            toast.success('풀이 삭제되었습니다.');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '풀 삭제에 실패했습니다.');
          }
        }
      });
    },
    [refresh, selectedPoolId, toast]
  );

  const createNewItem = useCallback(async () => {
    try {
      const newItem: Omit<Item, 'item_id'> = {
        name: '새 아이템',
        rarity: 'R',
        discord_role_id: null,
        is_active: true,
        duplicate_refund_points: 0,
        reward_points: 0
      };
      const res = await fetch('/api/admin/gacha/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      await refresh();
      toast.success('새 아이템이 생성되었습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '아이템 생성에 실패했습니다.');
    }
  }, [refresh, toast]);

  const deleteItem = useCallback(
    async (itemId: string) => {
      setConfirmModal({
        isOpen: true,
        title: '아이템 삭제',
        message: '정말 이 아이템을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
        onConfirm: async () => {
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} });
          try {
            const res = await fetch(`/api/admin/gacha/items?itemId=${encodeURIComponent(itemId)}`, { method: 'DELETE' });
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
            await refresh();
            toast.success('아이템이 삭제되었습니다.');
          } catch (e) {
            toast.error(e instanceof Error ? e.message : '아이템 삭제에 실패했습니다.');
          }
        }
      });
    },
    [refresh, toast]
  );

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (searchText && !it.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterRarity && it.rarity !== filterRarity) return false;
      if (filterInPool && !poolItems.has(it.item_id)) return false;
      return true;
    });
  }, [items, searchText, filterRarity, filterInPool, poolItems]);

  const selectedItem = useMemo(
    () => items.find((it) => it.item_id === selectedItemId) ?? null,
    [items, selectedItemId]
  );

  const itemStats = useMemo(() => {
    const total = items.length;
    const active = items.filter((it) => it.is_active).length;
    const inPool = items.filter((it) => poolItems.has(it.item_id)).length;
    return { total, active, inPool };
  }, [items, poolItems]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedItemId('');
      return;
    }
    if (!selectedItemId || !filteredItems.some((it) => it.item_id === selectedItemId)) {
      setSelectedItemId(filteredItems[0]!.item_id);
    }
  }, [filteredItems, selectedItemId]);

  const updateItemDraft = useCallback((itemId: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.item_id === itemId ? { ...it, ...patch } : it)));
  }, []);

  const applyPoolToFiltered = useCallback(
    async (add: boolean) => {
      if (!selectedPoolId) return;
      const targetIds = filteredItems.map((it) => it.item_id);
      if (targetIds.length === 0) {
        toast.info('대상 아이템이 없습니다.', { durationMs: 1600 });
        return;
      }

      setPoolItems((prev) => {
        const next = new Set(prev);
        for (const id of targetIds) {
          if (add) next.add(id);
          else next.delete(id);
        }
        return next;
      });

      try {
        await Promise.all(
          targetIds.map((itemId) =>
            fetch('/api/admin/gacha/pool-items', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ poolId: selectedPoolId, itemId, action: add ? 'add' : 'remove' })
            })
          )
        );
        toast.success(add ? `필터 결과 ${targetIds.length}개를 풀에 추가했습니다.` : `필터 결과 ${targetIds.length}개를 풀에서 제외했습니다.`);
      } catch (error) {
        console.error('[AdminGacha] Failed to apply filtered pool update:', error);
        toast.error('일괄 반영 중 일부 요청이 실패했습니다.');
      }
    },
    [filteredItems, selectedPoolId, toast]
  );

  return (
    <main className="flex h-[calc(100dvh-64px)] overflow-hidden">
      <aside className="w-80 flex-shrink-0 border-r border-[color:var(--border)] bg-[color:var(--card)] p-4 overflow-y-auto">
        <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight font-bangul">가챠 관리</h1>
        <p className="mt-1 text-xs muted">풀 선택 후 설정하세요.</p>

        <button
          type="button"
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold cursor-pointer"
          onClick={() => void createPool('permanent')}
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          <span>새 풀 추가</span>
        </button>

        <div className="mt-4 space-y-2">
          {pools.map((p) => (
            <div
              key={p.pool_id}
              className={`w-full rounded-2xl border p-3 transition ${
                selectedPoolId === p.pool_id
                  ? 'border-[color:var(--border)] bg-[color:var(--bg)]'
                  : 'border-transparent bg-[color:var(--chip)]'
              }`}
            >
              <button
                type="button"
                className="w-full text-left cursor-pointer"
                onClick={() => setSelectedPoolId(p.pool_id)}
              >
                <div className="relative aspect-[8/3] overflow-hidden rounded-xl border border-[color:var(--border)] bg-black/20">
                  <Image
                    src={p.banner_image_url ?? '/banner.png'}
                    alt=""
                    fill
                    sizes="320px"
                    className="object-cover"
                  />
                </div>
                <div className="mt-2 text-sm font-semibold truncate">{p.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs muted">
                  <span>{p.kind === 'permanent' ? '상시' : '한정'}</span>
                  <span>•</span>
                  <span>{p.is_active ? '활성' : '비활성'}</span>
                </div>
              </button>
              {selectedPoolId === p.pool_id && (
                <button
                  type="button"
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-red-200/30 bg-red-200/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-200/20 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deletePool(p.pool_id);
                  }}
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2} />
                  <span>풀 삭제</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        {!pool ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm muted">왼쪽에서 풀을 선택하거나 추가하세요.</p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-tight">{pool.name}</h2>
            <p className="mt-1 text-sm muted">풀 설정 및 아이템을 관리합니다.</p>

            <section className="mt-6 rounded-3xl card-glass p-6">
              <h3 className="text-lg font-semibold">기본 설정</h3>
              <div className="mt-4 grid gap-4">
                <label className="text-sm">
                  이름
                  <input
                    className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                    value={pool.name}
                    onChange={(e) => setPools((prev) => prev.map((x) => (x.pool_id === pool.pool_id ? { ...x, name: e.target.value } : x)))}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    타입
                    <div className="relative mt-1">
                      <select
                        className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)]"
                        value={pool.kind}
                        onChange={(e) =>
                          setPools((prev) =>
                            prev.map((x) => {
                              if (x.pool_id !== pool.pool_id) return x;
                              const nextKind = e.target.value as Pool['kind'];
                              if (nextKind === 'permanent') {
                                return { ...x, kind: nextKind, start_at: null, end_at: null };
                              }
                              return { ...x, kind: nextKind };
                            })
                          )
                        }
                      >
                        <option value="permanent">상시</option>
                        <option value="limited">한정</option>
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]"
                        aria-hidden="true"
                        strokeWidth={2}
                      />
                    </div>
                  </label>

                  <label className="text-sm">
                    활성
                    <div className="mt-2">
                      <Checkbox
                        checked={pool.is_active}
                        onChange={(checked) =>
                          setPools((prev) =>
                            prev.map((x) => (x.pool_id === pool.pool_id ? { ...x, is_active: checked } : x))
                          )
                        }
                        label="비활성화하면 뽑기에서 노출되지 않습니다."
                      />
                    </div>
                  </label>
                </div>

                {pool.kind === 'limited' && (
                  <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-4">
                    <div className="text-sm font-semibold">기간 (한정 픽업)</div>
                    <p className="mt-1 text-xs muted">
                      종료 시간이 지나면 이 풀은 뽑기 목록에서 자동으로 숨겨집니다. (아이템은 삭제되지 않습니다)
                    </p>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm">
                        시작
                        <input
                          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2 text-sm text-[color:var(--fg)]"
                          type="datetime-local"
                          value={toDatetimeLocal(pool.start_at ?? null)}
                          onChange={(e) => {
                            const iso = toIsoOrNull(e.target.value);
                            setPools((prev) =>
                              prev.map((x) =>
                                x.pool_id === pool.pool_id
                                  ? { ...x, start_at: iso }
                                  : x
                              )
                            );
                          }}
                        />
                      </label>
                      <label className="text-sm">
                        종료
                        <input
                          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2 text-sm text-[color:var(--fg)]"
                          type="datetime-local"
                          value={toDatetimeLocal(pool.end_at ?? null)}
                          onChange={(e) => {
                            const iso = toIsoOrNull(e.target.value);
                            setPools((prev) =>
                              prev.map((x) =>
                                x.pool_id === pool.pool_id
                                  ? { ...x, end_at: iso }
                                  : x
                              )
                            );
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <label className="text-sm">
                  배너
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`pool-banner-${pool.pool_id}`}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.type === 'image/gif') {
                          void uploadPoolBanner(pool.pool_id, f);
                        } else {
                          const srcUrl = URL.createObjectURL(f);
                          setBannerCrop({ poolId: pool.pool_id, srcUrl });
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                    <label
                      htmlFor={`pool-banner-${pool.pool_id}`}
                      className="inline-flex cursor-pointer items-center rounded-xl btn-soft px-3 py-2 text-xs font-semibold"
                    >
                      업로드
                    </label>
                    <button
                      type="button"
                      className="rounded-xl btn-soft px-3 py-2 text-xs font-semibold cursor-pointer"
                      onClick={() => void clearPoolBanner(pool.pool_id)}
                      disabled={!pool.banner_image_url}
                    >
                      제거
                    </button>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]">
                    <Image
                      src={pool.banner_image_url ?? '/banner.png'}
                      alt=""
                      width={1600}
                      height={600}
                      className="h-auto w-full"
                    />
                  </div>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    비용(포인트)
                    <input
                      className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                      type="number"
                      value={pool.cost_points}
                      onChange={(e) =>
                        setPools((prev) =>
                          prev.map((x) => (x.pool_id === pool.pool_id ? { ...x, cost_points: Number(e.target.value) } : x))
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    무료 주기(초)
                    <input
                      className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                      type="number"
                      value={pool.free_pull_interval_seconds ?? ''}
                      onChange={(e) =>
                        setPools((prev) =>
                          prev.map((x) =>
                            x.pool_id === pool.pool_id
                              ? { ...x, free_pull_interval_seconds: e.target.value === '' ? null : Number(e.target.value) }
                              : x
                          )
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    천장(횟수)
                    <input
                      className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                      type="number"
                      value={pool.pity_threshold ?? ''}
                      onChange={(e) =>
                        setPools((prev) =>
                          prev.map((x) =>
                            x.pool_id === pool.pool_id
                              ? { ...x, pity_threshold: e.target.value === '' ? null : Number(e.target.value) }
                              : x
                          )
                        )
                      }
                    />
                  </label>
                  <label className="text-sm">
                    천장 희귀도
                    <div className="relative mt-1">
                      <select
                        className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)]"
                        value={pool.pity_rarity ?? ''}
                        onChange={(e) =>
                          setPools((prev) =>
                            prev.map((x) =>
                              x.pool_id === pool.pool_id
                                ? { ...x, pity_rarity: (e.target.value || null) as Pool['pity_rarity'] }
                                : x
                            )
                          )
                        }
                      >
                        <option value="">(사용 안 함)</option>
                        {RARITIES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]"
                        aria-hidden="true"
                        strokeWidth={2}
                      />
                    </div>
                  </label>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-4">
                  <div className="text-sm font-semibold">희귀도 확률(%)</div>
                  <p className="mt-1 text-xs muted">R/S/SS/SSS를 먼저 뽑은 뒤, 해당 희귀도 내에서 아이템을 선택합니다.</p>
                  <div className="mt-3">
                    <Checkbox
                      checked={autoBalanceRates}
                      onChange={setAutoBalanceRates}
                      label="입력한 값 기준으로 나머지 확률을 자동 배분 (합계 100%)"
                    />
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    {(
                      [
                        ['R', 'rate_r'] as const,
                        ['S', 'rate_s'] as const,
                        ['SS', 'rate_ss'] as const,
                        ['SSS', 'rate_sss'] as const
                      ]
                    ).map(([label, key]) => (
                      <label key={key} className="text-sm">
                        {label}
                        <input
                          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2 text-sm text-[color:var(--fg)]"
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={pool[key]}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setPools((prev) =>
                              prev.map((x) => {
                                if (x.pool_id !== pool.pool_id) return x;
                                if (!autoBalanceRates) {
                                  return {
                                    ...x,
                                    [key]: Number.isFinite(v) ? v : 0,
                                  };
                                }
                                return rebalanceRates(x, key, v);
                              })
                            );
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 text-xs muted">
                    합계: {(pool.rate_r + pool.rate_s + pool.rate_ss + pool.rate_sss).toFixed(2)}% (100%가 되어야 저장됩니다)
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">시뮬레이터</div>
                      <p className="mt-1 text-xs muted">
                        현재 선택된 풀 설정/아이템으로 N회 가상 뽑기를 돌려 분포를 확인합니다.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        className="w-28 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2 text-sm text-[color:var(--fg)]"
                        type="number"
                        min={1}
                        max={200000}
                        step={1}
                        value={simAmount}
                        onChange={(e) => setSimAmount(Number(e.target.value))}
                      />
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-xl btn-soft px-3 py-2 text-xs font-semibold cursor-pointer"
                        onClick={() => {
                          setSimBusy(true);
                          setTimeout(() => {
                            try {
                              simulate();
                            } finally {
                              setSimBusy(false);
                            }
                          }, 0);
                        }}
                        disabled={simBusy}
                        title="시뮬레이션 실행"
                      >
                        <Dices className="h-4 w-4" />
                        {simBusy ? '계산 중…' : '실행'}
                      </button>
                    </div>
                  </div>

                  {simResult ? (
                    <div className="mt-4 grid gap-4">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/40 p-3 text-xs">
                          <div className="font-semibold">희귀도 분포</div>
                          <div className="mt-2 grid gap-1">
                            {(
                              [
                                ['SSS', 'SSS'] as const,
                                ['SS', 'SS'] as const,
                                ['S', 'S'] as const,
                                ['R', 'R'] as const
                              ]
                            ).map(([label, r]) => {
                              const c = simResult.rarityCounts[r];
                              const pct = simResult.n ? (c / simResult.n) * 100 : 0;
                              return (
                                <div key={r} className="flex items-center justify-between">
                                  <span className="font-semibold">{label}</span>
                                  <span className="font-mono">
                                    {c.toLocaleString()} ({pct.toFixed(2)}%)
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/40 p-3 text-xs">
                          <div className="font-semibold">천장</div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="muted">강제 발동 횟수</span>
                            <span className="font-mono">{simResult.pityForcedCount.toLocaleString()}</span>
                          </div>
                          <div className="mt-2 text-[11px] muted">
                            * 천장 설정(횟수/희귀도)이 켜져 있을 때만 의미가 있습니다.
                          </div>
                        </div>
                      </div>

                      {simResult.topItems.length > 0 && (
                        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/40 p-3 text-xs">
                          <div className="font-semibold">상위 아이템(Top 10)</div>
                          <div className="mt-2 grid gap-1">
                            {simResult.topItems.map((x) => (
                              <div key={x.itemId} className="flex items-center justify-between gap-3">
                                <span className="truncate">
                                  <span className="font-semibold mr-2">{x.rarity}</span>
                                  {x.name}
                                </span>
                                <span className="font-mono">{x.count.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 text-xs muted">
                      실행을 누르면 결과가 여기에 표시됩니다.
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="w-fit rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold cursor-pointer"
                  onClick={() => {
                    const sum = pool.rate_r + pool.rate_s + pool.rate_ss + pool.rate_sss;
                    if (Math.abs(sum - 100) > 0.01) {
                      toast.error(`희귀도 확률 합계는 100%여야 합니다. (현재: ${sum.toFixed(2)}%)`);
                      return;
                    }
                    void savePool(pool);
                  }}
                >
                  풀 저장
                </button>
              </div>
            </section>

            {bannerCrop ? (
              <ImageCropModal
                title="가챠 배너 자르기"
                description="GIF가 아닌 이미지는 AVIF(WebP 대체)로 압축하여 저장합니다."
                src={bannerCrop.srcUrl}
                aspect={1600 / 600}
                output={{ width: 1600, height: 600, fileNameBase: `gacha-banner-${bannerCrop.poolId}` }}
                preferredOutputMimes={['image/avif', 'image/webp']}
                quality={0.78}
                busy={bannerUploading}
                onClose={() => {
                  URL.revokeObjectURL(bannerCrop.srcUrl);
                  setBannerCrop(null);
                }}
                onConfirm={(file) => {
                  URL.revokeObjectURL(bannerCrop.srcUrl);
                  setBannerCrop(null);
                  void uploadPoolBanner(bannerCrop.poolId, file);
                }}
              />
            ) : null}

            <section className="mt-6 rounded-3xl card-glass p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">아이템 관리</h3>
                  <p className="mt-1 text-xs muted">목록에서 아이템을 고른 뒤 오른쪽 상세 패널에서 빠르게 수정/저장하세요.</p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold cursor-pointer"
                  onClick={() => void createNewItem()}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  <span>새 아이템</span>
                </button>
              </div>

              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                  <div className="muted-2">전체 아이템</div>
                  <div className="mt-1 text-sm font-semibold">{itemStats.total.toLocaleString()}개</div>
                </div>
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                  <div className="muted-2">활성 아이템</div>
                  <div className="mt-1 text-sm font-semibold">{itemStats.active.toLocaleString()}개</div>
                </div>
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                  <div className="muted-2">현재 풀 포함</div>
                  <div className="mt-1 text-sm font-semibold">{itemStats.inPool.toLocaleString()}개</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  className="flex-1 min-w-[180px] rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                  placeholder="아이템 이름 검색..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <div className="relative">
                  <select
                    className="appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-8 text-sm text-[color:var(--fg)] cursor-pointer"
                    value={filterRarity}
                    onChange={(e) => setFilterRarity(e.target.value)}
                  >
                    <option value="">모든 등급</option>
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-[color:var(--muted-2)]" />
                </div>
                {selectedPoolId && (
                  <div className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
                    <Checkbox checked={filterInPool} onChange={setFilterInPool} label="이 풀만 보기" />
                    <button
                      type="button"
                      className="rounded-lg btn-soft px-2.5 py-1 text-[11px] font-semibold"
                      onClick={() => void applyPoolToFiltered(true)}
                    >
                      필터 전체 추가
                    </button>
                    <button
                      type="button"
                      className="rounded-lg btn-soft px-2.5 py-1 text-[11px] font-semibold"
                      onClick={() => void applyPoolToFiltered(false)}
                    >
                      필터 전체 제외
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60">
                  <div className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-2 text-xs">
                    <span className="muted">검색 결과</span>
                    <span className="font-semibold">{filteredItems.length}개</span>
                  </div>
                  <div className="max-h-[560px] overflow-y-auto p-2">
                    {filteredItems.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[color:var(--border)] px-3 py-6 text-center text-xs muted">조건에 맞는 아이템이 없습니다.</div>
                    ) : (
                      <div className="space-y-2">
                        {filteredItems.map((it) => {
                          const selected = selectedItemId === it.item_id;
                          const inCurrentPool = poolItems.has(it.item_id);
                          return (
                            <button
                              key={it.item_id}
                              type="button"
                              className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                                selected
                                  ? 'border-[color:var(--accent-pink)]/60 bg-[color:var(--accent-pink)]/12'
                                  : 'border-[color:var(--border)] bg-[color:var(--card)] hover:border-[color:var(--fg)]/20'
                              }`}
                              onClick={() => setSelectedItemId(it.item_id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate text-sm font-semibold">{it.name}</div>
                                <span className="rounded-lg border border-[color:var(--border)] px-2 py-0.5 text-[10px] font-semibold">{it.rarity}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] muted-2">
                                <span>{it.is_active ? '활성' : '비활성'}</span>
                                {selectedPoolId && <span>• {inCurrentPool ? '현재 풀 포함' : '현재 풀 제외'}</span>}
                                <span>• ID {it.item_id.slice(0, 8)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] p-4">
                  {!selectedItem ? (
                    <div className="rounded-xl border border-dashed border-[color:var(--border)] px-4 py-10 text-center text-sm muted">
                      왼쪽 목록에서 수정할 아이템을 선택하세요.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">선택 아이템</div>
                          <div className="text-xs muted-2">ID: {selectedItem.item_id}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-xl border border-red-200/30 bg-red-200/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-200/20"
                            onClick={() => void deleteItem(selectedItem.item_id)}
                          >
                            삭제
                          </button>
                          <button
                            type="button"
                            className="rounded-xl btn-bangul px-3 py-2 text-xs font-semibold"
                            onClick={() => void saveItem(selectedItem)}
                          >
                            저장
                          </button>
                        </div>
                      </div>

                      <label className="text-sm">
                        아이템 이름
                        <input
                          className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                          value={selectedItem.name}
                          onChange={(e) => updateItemDraft(selectedItem.item_id, { name: e.target.value })}
                        />
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm">
                          희귀도
                          <div className="relative mt-1">
                            <select
                              className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-9 text-sm text-[color:var(--fg)]"
                              value={selectedItem.rarity}
                              onChange={(e) => updateItemDraft(selectedItem.item_id, { rarity: e.target.value as Item['rarity'] })}
                            >
                              {RARITIES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
                          </div>
                        </label>
                        <div className="text-sm">
                          <div className="mb-2">상태</div>
                          <Checkbox
                            checked={selectedItem.is_active}
                            onChange={(checked) => updateItemDraft(selectedItem.item_id, { is_active: checked })}
                            label="활성"
                          />
                          {selectedPoolId && (
                            <div className="mt-2">
                              <Checkbox
                                checked={poolItems.has(selectedItem.item_id)}
                                onChange={(checked) => void togglePoolItem(selectedItem.item_id, checked)}
                                label="현재 풀 포함"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 p-4">
                        <CustomSelect
                          label="디스코드 역할"
                          value={selectedItem.discord_role_id ?? ''}
                          onChange={(value) =>
                            updateItemDraft(selectedItem.item_id, {
                              discord_role_id: value || null,
                              reward_points: value ? 0 : selectedItem.reward_points
                            })
                          }
                          options={[
                            { value: '', label: '(없음)' },
                            ...roles.map((r) => ({ value: r.id, label: r.name }))
                          ]}
                          placeholder="역할 선택"
                        />

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="text-sm">
                            중복 환급 포인트
                            <input
                              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--fg)] disabled:opacity-55"
                              type="number"
                              min={0}
                              value={selectedItem.duplicate_refund_points}
                              disabled={!selectedItem.discord_role_id}
                              onChange={(e) => updateItemDraft(selectedItem.item_id, { duplicate_refund_points: Number(e.target.value) })}
                            />
                            <p className="mt-1 text-[11px] muted-2">역할형 아이템에서만 사용됩니다.</p>
                          </label>

                          <label className="text-sm">
                            포인트 보상
                            <input
                              className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2 text-sm text-[color:var(--fg)] disabled:opacity-55"
                              type="number"
                              min={0}
                              value={selectedItem.reward_points}
                              disabled={Boolean(selectedItem.discord_role_id)}
                              onChange={(e) => updateItemDraft(selectedItem.item_id, { reward_points: Number(e.target.value) })}
                            />
                            <p className="mt-1 text-[11px] muted-2">역할이 없을 때만 지급됩니다.</p>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })}
        confirmText="삭제"
        cancelText="취소"
        danger
      />
    </main>
  );
}
