'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { m, AnimatePresence } from 'framer-motion';
import { Package, Sparkles, CheckCircle2, Circle, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';

type InventoryItem = {
  itemId: string;
  qty: number;
  item: {
    name: string;
    rarity: 'R' | 'S' | 'SS' | 'SSS';
    discord_role_id: string | null;
  };
};

type EquippedItem = {
  itemId: string | null;
  item: {
    name: string;
    rarity: 'R' | 'S' | 'SS' | 'SSS';
    discord_role_id: string | null;
  } | null;
};

type InventoryData = {
  balance: number;
  equipped: EquippedItem | null;
  inventory: InventoryItem[];
};

const RARITY_COLORS = {
  R: 'from-gray-400/20 to-gray-500/10 border-gray-400/30',
  S: 'from-blue-400/20 to-blue-500/10 border-blue-400/30',
  SS: 'from-purple-400/20 to-purple-500/10 border-purple-400/30',
  SSS: 'from-amber-400/20 to-amber-500/10 border-amber-400/30'
};

const RARITY_TEXT_COLORS = {
  R: 'text-gray-400',
  S: 'text-blue-400',
  SS: 'text-purple-400',
  SSS: 'text-amber-400'
};

const RARITY_GLOW = {
  R: '',
  S: 'shadow-[0_0_15px_rgba(96,165,250,0.3)]',
  SS: 'shadow-[0_0_20px_rgba(192,132,252,0.4)]',
  SSS: 'shadow-[0_0_30px_rgba(251,191,36,0.5)]'
};

export default function InventoryClient() {
  const toast = useToast();
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [equipLoading, setEquipLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }
      const result = (await res.json()) as InventoryData;
      setData(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '인벤토리를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const handleEquip = useCallback(
    async (itemId: string) => {
      setEquipLoading(true);
      try {
        const res = await fetch('/api/inventory/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
        }

        await fetchInventory();
        toast.success('장착되었습니다.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '장착에 실패했습니다.');
      } finally {
        setEquipLoading(false);
      }
    },
    [fetchInventory, toast]
  );

  const handleUnequip = useCallback(async () => {
    setEquipLoading(true);
    try {
      const res = await fetch('/api/inventory/unequip', { method: 'POST' });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error((body as { error?: string })?.error ?? `HTTP ${res.status}`);
      }

      await fetchInventory();
      toast.success('장착 해제되었습니다.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '장착 해제에 실패했습니다.');
    } finally {
      setEquipLoading(false);
    }
  }, [fetchInventory, toast]);

  const equippedItemId = data?.equipped?.itemId;
  const allItems = data?.inventory ?? [];
  const query = search.trim().toLowerCase();
  const filteredItems = query
    ? allItems.filter((inv) => inv.item.name.toLowerCase().includes(query))
    : allItems;

  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen pb-20 bg-bangul">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">인벤토리</h1>
          <p className="mt-1 text-sm muted">보유 중인 아이템과 장착 상태를 확인하세요.</p>
        </div>

        <div className="mb-6 rounded-3xl card-glass p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--accent-pink)]/5 via-transparent to-[color:var(--accent-lavender)]/5 pointer-events-none" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <m.div 
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--accent-pink)] to-[color:var(--accent-lavender)] border border-[color:var(--border)] shadow-lg"
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <Sparkles className="h-7 w-7 text-white" />
              </m.div>
              <div>
                <div className="text-xs font-semibold muted mb-1">보유 포인트</div>
                <div className="text-3xl font-bold bg-gradient-to-r from-[color:var(--accent-pink)] to-[color:var(--accent-lavender)] bg-clip-text text-transparent">
                  {loading || !data ? <Skeleton className="h-8 w-24" /> : `${(data?.balance ?? 0).toLocaleString()} P`}
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading || !data ? (
          <div className="space-y-8">
            <section>
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-48 rounded-[32px]" />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <>
            {data?.equipped?.item && (
              <section className="mb-8">
                <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[color:var(--accent-mint)]" />
                  현재 장착 중
                </h2>
                <div
                  className={`
                    relative overflow-hidden rounded-3xl border-2 p-6 
                    bg-gradient-to-br ${RARITY_COLORS[data.equipped.item.rarity]}
                    ${RARITY_GLOW[data.equipped.item.rarity]}
                    animate-pulse-slow
                  `}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] animate-shimmer pointer-events-none" />
                  <div className="relative flex items-center justify-between">
                    <div>
                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 text-xs font-bold mb-3 ${RARITY_TEXT_COLORS[data.equipped.item.rarity]} bg-[color:var(--chip)]`}>
                        <Sparkles className="h-3 w-3" />
                        {data.equipped.item.rarity}
                      </div>
                      <div className="text-xl font-bold text-[color:var(--fg)]">{data.equipped.item.name}</div>
                    </div>
                    <button
                      onClick={() => void handleUnequip()}
                      disabled={equipLoading}
                      className="rounded-xl btn-soft px-5 py-2.5 text-sm font-semibold disabled:opacity-50 cursor-pointer hover:scale-105 transition-transform"
                    >
                      {equipLoading ? '처리 중…' : '장착 해제'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Package className="h-5 w-5 text-[color:var(--accent-sky)]" />
                보유 아이템
              </h2>

              {!data?.inventory || data.inventory.length === 0 ? (
                <div className="rounded-3xl card-glass p-12 text-center">
                  <Package className="mx-auto h-16 w-16 text-[color:var(--muted-2)] mb-4" />
                  <p className="text-sm muted">보유 중인 아이템이 없습니다.</p>
                  <a
                    href="/draw"
                    className="mt-4 inline-block rounded-xl btn-bangul px-6 py-3 text-sm font-semibold"
                  >
                    뽑기 하러 가기
                  </a>
                </div>
              ) : (
                <>
                  <div className="mb-5 rounded-3xl card-glass p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="아이템 이름 검색…"
                          className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] pl-11 pr-11 py-3 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/30"
                        />
                        {search ? (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-[color:var(--muted-2)] hover:bg-[color:var(--bg)]/50 hover:text-[color:var(--fg)] transition cursor-pointer"
                            aria-label="검색어 지우기"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="text-xs muted">
                          {filteredItems.length.toLocaleString()} / {allItems.length.toLocaleString()}
                        </div>
                        {query ? (
                          <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-1 text-xs font-semibold text-[color:var(--fg)]">
                            "{search.trim()}"
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {allItems.length > 0 && filteredItems.length === 0 ? (
                    <div className="rounded-3xl card-glass p-12 text-center">
                      <Package className="mx-auto h-16 w-16 text-[color:var(--muted-2)] mb-4" />
                      <p className="text-sm muted">검색 결과가 없습니다.</p>
                      <button
                        type="button"
                        className="mt-4 inline-flex rounded-xl btn-soft px-6 py-3 text-sm font-semibold cursor-pointer"
                        onClick={() => setSearch('')}
                      >
                        검색어 지우기
                      </button>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <AnimatePresence mode="popLayout">
                        {filteredItems.map((inv, idx) => {
                          const isEquipped = equippedItemId === inv.itemId;
                          return (
                            <m.div
                              key={inv.itemId}
                              layout
                              layoutId={`inv-${inv.itemId}`}
                              exit={{ opacity: 0, scale: 0.95 }}
                              whileHover={{ scale: 1.03, y: -4 }}
                              transition={{ 
                                duration: 0.3, 
                                delay: idx * 0.05,
                                type: 'spring',
                                stiffness: 300
                              }}
                              className={`
                                group relative overflow-hidden rounded-3xl border-2 p-6 transition-all cursor-pointer
                                bg-gradient-to-br ${RARITY_COLORS[inv.item.rarity]}
                                ${RARITY_GLOW[inv.item.rarity]}
                                hover:brightness-110 hover:shadow-2xl
                                ${isEquipped ? 'ring-2 ring-[color:var(--accent-mint)] ring-offset-4 ring-offset-[color:var(--bg)]' : ''}
                              `}
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 pointer-events-none" />
                              
                              <div className="absolute top-3 right-3 z-10">
                                <m.div 
                                  className="rounded-full bg-[color:var(--chip)] px-3 py-1.5 text-xs font-bold border-2 border-[color:var(--border)] shadow-lg"
                                  whileHover={{ scale: 1.1 }}
                                >
                                  ×{inv.qty}
                                </m.div>
                              </div>

                              <div className="relative mb-3">
                                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 text-xs font-bold ${RARITY_TEXT_COLORS[inv.item.rarity]} bg-[color:var(--chip)]`}>
                                  <Sparkles className="h-3 w-3" />
                                  {inv.item.rarity}
                                </div>
                              </div>

                              <div className="relative mb-5">
                                <div className="text-lg font-bold text-[color:var(--fg)]">{inv.item.name}</div>
                              </div>

                              <button
                                onClick={() => void (isEquipped ? handleUnequip() : handleEquip(inv.itemId))}
                                disabled={equipLoading}
                                className={`
                                  relative w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all
                                  disabled:opacity-50 cursor-pointer overflow-hidden
                                  hover:scale-[1.02] active:scale-[0.98]
                                  ${
                                    isEquipped
                                      ? 'bg-[color:var(--accent-mint)] text-white hover:bg-[color:var(--accent-mint)] border-2 border-[color:var(--accent-mint)]'
                                      : 'btn-bangul'
                                  }
                                `}
                              >
                                {equipLoading ? (
                                  '처리 중...'
                                ) : isEquipped ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <CheckCircle2 className="h-4 w-4" />
                                    장착 중
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-2">
                                    <Circle className="h-4 w-4" />
                                    장착하기
                                  </span>
                                )}
                              </button>
                            </m.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
