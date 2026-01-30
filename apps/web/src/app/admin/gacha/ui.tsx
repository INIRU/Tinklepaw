'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
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
};

const RARITIES: Array<Item['rarity']> = ['R', 'S', 'SS', 'SSS'];

export default function GachaAdminClient() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');
  const [poolItems, setPoolItems] = useState<Set<string>>(new Set());
  
  // Item Filters
  const [searchText, setSearchText] = useState('');
  const [filterRarity, setFilterRarity] = useState<string>('');
  const [filterInPool, setFilterInPool] = useState(false);

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
          pity_rarity: null
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
        duplicate_refund_points: 0
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

  return (
    <main className="flex h-screen">
      <aside className="w-80 border-r border-[color:var(--border)] bg-[color:var(--card)] p-4 overflow-auto">
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

      <div className="flex-1 overflow-auto p-6">
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
                          setPools((prev) => prev.map((x) => (x.pool_id === pool.pool_id ? { ...x, kind: e.target.value as Pool['kind'] } : x)))
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
                              prev.map((x) => (x.pool_id === pool.pool_id ? { ...x, [key]: Number.isFinite(v) ? v : 0 } : x))
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">아이템 관리</h3>
                  <p className="mt-1 text-xs muted">디스코드 역할과 연동된 가챠 아이템을 관리합니다.</p>
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

              <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
                <input
                  className="flex-1 min-w-[150px] rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)]"
                  placeholder="이름 검색…"
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
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-[color:var(--muted-2)]" />
                </div>
                {selectedPoolId && (
                  <div className="flex items-center pl-2 border-l border-[color:var(--border)]">
                    <Checkbox
                      checked={filterInPool}
                      onChange={setFilterInPool}
                      label="이 풀만 보기"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {filteredItems.map((it) => {
                  const rarityColors = {
                    R: 'bg-gray-500/10 border-gray-500/20 text-gray-600 dark:text-gray-300',
                    S: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300',
                    SS: 'bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-300',
                    SSS: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300'
                  };
                  return (
                    <div key={it.item_id} className="group rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--card)] to-[color:var(--chip)] p-5 hover:border-[color:var(--fg)]/20 transition-all">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`px-3 py-1 rounded-xl border font-semibold text-xs ${rarityColors[it.rarity]}`}>
                            {it.rarity}
                          </div>
                          <div className="min-w-0 flex-1">
                            <input
                              className="w-full bg-transparent border-none outline-none text-base font-semibold text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:text-[color:var(--fg)]"
                              value={it.name}
                              placeholder="아이템 이름"
                              onChange={(e) => setItems((prev) => prev.map((x) => (x.item_id === it.item_id ? { ...x, name: e.target.value } : x)))}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Checkbox
                            checked={it.is_active}
                            onChange={(checked) =>
                              setItems((prev) => prev.map((x) => (x.item_id === it.item_id ? { ...x, is_active: checked } : x)))
                            }
                            label="활성"
                          />
                          {selectedPoolId && (
                            <Checkbox
                              checked={poolItems.has(it.item_id)}
                              onChange={(checked) => void togglePoolItem(it.item_id, checked)}
                              label="이 풀에 포함"
                            />
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div>
                          <label className="block text-xs font-medium muted mb-1.5">희귀도</label>
                          <div className="relative">
                            <select
                              className="w-full appearance-none rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 pr-10 text-sm text-[color:var(--fg)] focus:border-[color:var(--fg)]/40 transition"
                              value={it.rarity}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((x) => (x.item_id === it.item_id ? { ...x, rarity: e.target.value as Item['rarity'] } : x))
                                )
                              }
                            >
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
                        </div>

                        <div className="sm:col-span-2 lg:col-span-1">
                          <CustomSelect
                            label="디스코드 역할"
                            value={it.discord_role_id ?? ''}
                            onChange={(value) =>
                              setItems((prev) =>
                                prev.map((x) => (x.item_id === it.item_id ? { ...x, discord_role_id: value || null } : x))
                              )
                            }
                            options={[
                              { value: '', label: '(없음)' },
                              ...roles.map((r) => ({ value: r.id, label: r.name }))
                            ]}
                            placeholder="역할 선택"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium muted mb-1.5">중복 환급</label>
                          <input
                            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-[color:var(--fg)] focus:border-[color:var(--fg)]/40 transition"
                            type="number"
                            min={0}
                            value={it.duplicate_refund_points}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.item_id === it.item_id ? { ...x, duplicate_refund_points: Number(e.target.value) } : x
                                )
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-xl border border-red-200/30 bg-red-200/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-200/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={() => void deleteItem(it.item_id)}
                        >
                          <Trash2 className="h-3 w-3" strokeWidth={2} />
                          <span>삭제</span>
                        </button>
                        <button
                          type="button"
                          className="rounded-xl btn-bangul px-4 py-2 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={() => void saveItem(it)}
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  );
                })}
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
