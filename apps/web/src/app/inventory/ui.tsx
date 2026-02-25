'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { m, AnimatePresence } from 'framer-motion';
import { Package, Sparkles, CheckCircle2, Search, X, Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import gsap from 'gsap';

type InventoryItem = {
  itemId: string;
  qty: number;
  item: {
    name: string;
    rarity: 'R' | 'S' | 'SS' | 'SSS';
    discord_role_id: string | null;
    roleIconUrl?: string | null;
  };
};

type EquippedItem = {
  itemId: string | null;
  item: {
    name: string;
    rarity: 'R' | 'S' | 'SS' | 'SSS';
    discord_role_id: string | null;
    roleIconUrl?: string | null;
  } | null;
};

type InventoryData = {
  balance: number;
  equipped: EquippedItem | null;
  inventory: InventoryItem[];
};

const RARITY_COLORS = {
  R: 'from-slate-400/20 to-slate-500/10 border-slate-400/30',
  S: 'from-blue-400/22 to-blue-500/12 border-blue-400/35',
  SS: 'from-purple-400/25 to-purple-500/14 border-purple-400/40',
  SSS: 'from-amber-400/28 to-amber-500/16 border-amber-400/45'
};

const RARITY_TEXT_COLORS = {
  R: 'text-slate-400',
  S: 'text-blue-400',
  SS: 'text-purple-400',
  SSS: 'text-amber-400'
};

const RARITY_GLOW_HOVER = {
  R: 'hover:shadow-[0_0_18px_rgba(148,163,184,0.25)]',
  S: 'hover:shadow-[0_0_22px_rgba(96,165,250,0.40)]',
  SS: 'hover:shadow-[0_0_28px_rgba(192,132,252,0.48)]',
  SSS: 'hover:shadow-[0_0_36px_rgba(251,191,36,0.56)]'
};

const RARITY_GLOW_BASE = {
  R: '',
  S: 'shadow-[0_0_10px_rgba(96,165,250,0.18)]',
  SS: 'shadow-[0_0_14px_rgba(192,132,252,0.26)]',
  SSS: 'shadow-[0_0_20px_rgba(251,191,36,0.36)]'
};

const RARITY_BORDER_EQUIPPED = {
  R: 'border-[color:var(--accent-mint)]',
  S: 'border-[color:var(--accent-sky)]',
  SS: 'border-[color:var(--accent-lavender)]',
  SSS: 'border-amber-400'
};

const RARITY_EQUIPPED_GLOW = {
  R: 'shadow-[0_0_0_2px_rgba(57,211,179,0.35),0_0_24px_rgba(57,211,179,0.20)]',
  S: 'shadow-[0_0_0_2px_rgba(120,183,255,0.35),0_0_24px_rgba(120,183,255,0.20)]',
  SS: 'shadow-[0_0_0_2px_rgba(188,167,255,0.40),0_0_28px_rgba(188,167,255,0.22)]',
  SSS: 'shadow-[0_0_0_2px_rgba(251,191,36,0.45),0_0_32px_rgba(251,191,36,0.26)]'
};

const RARITY_SHINE_CLASS = {
  R: '',
  S: 'rarity-s-shine',
  SS: 'rarity-ss-shine',
  SSS: 'rarity-sss-shine'
};

const RARITY_BADGE_BG = {
  R: 'bg-slate-500/15 border-slate-400/30',
  S: 'bg-blue-500/15 border-blue-400/35',
  SS: 'bg-purple-500/15 border-purple-400/40',
  SSS: 'bg-amber-500/15 border-amber-400/45'
};

const ItemIcon = ({
  url,
  label,
  frameClass = 'h-16 w-16',
  imgClass = 'h-12 w-12',
  emojiClass = 'text-3xl'
}: {
  url?: string | null;
  label: string;
  frameClass?: string;
  imgClass?: string;
  emojiClass?: string;
}) => (
  <div
    className={`flex items-center justify-center rounded-2xl bg-[color:var(--card)]/80 border border-[color:var(--border)] shadow-inner ${frameClass}`}
  >
    {url ? (
      <img
        src={url}
        alt={`${label} 아이콘`}
        className={`object-cover ${imgClass}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    ) : (
      <span className={emojiClass} aria-label="아이템 아이콘">📦</span>
    )}
  </div>
);

export default function InventoryClient() {
  const toast = useToast();
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [equipLoading, setEquipLoading] = useState(false);
  const [search, setSearch] = useState('');
  const gridRef = useRef<HTMLDivElement | null>(null);
  const equippedSectionRef = useRef<HTMLElement | null>(null);
  const prevEquippedIdRef = useRef<string | null>(null);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      prefersReducedMotionRef.current = media.matches;
    };

    syncMotionPreference();
    media.addEventListener('change', syncMotionPreference);

    return () => media.removeEventListener('change', syncMotionPreference);
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

  useEffect(() => {
    if (loading) return;

    const grid = gridRef.current;
    if (!grid) return;

    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-inventory-card]'));
    if (cards.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cards,
        {
          autoAlpha: 0,
          y: prefersReducedMotionRef.current ? 0 : 16,
          scale: prefersReducedMotionRef.current ? 1 : 0.97
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: prefersReducedMotionRef.current ? 0.05 : 0.34,
          stagger: prefersReducedMotionRef.current ? 0 : 0.03,
          ease: 'power2.out',
          overwrite: 'auto'
        }
      );
    }, grid);

    return () => ctx.revert();
  }, [filteredItems.length, loading, query]);

  useEffect(() => {
    if (!equippedItemId) {
      prevEquippedIdRef.current = null;
      return;
    }

    if (prevEquippedIdRef.current === equippedItemId) return;
    prevEquippedIdRef.current = equippedItemId;

    if (prefersReducedMotionRef.current) return;

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });

    if (equippedSectionRef.current) {
      tl.fromTo(
        equippedSectionRef.current,
        { autoAlpha: 0.75, y: 10, scale: 0.98 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.28, ease: 'power2.out' }
      );
    }

    const equippedCard = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('[data-item-id]') ?? [],
    ).find((card) => card.dataset.itemId === equippedItemId);

    if (equippedCard) {
      tl.fromTo(
        equippedCard,
        { scale: 0.9, filter: 'brightness(1.45)' },
        { scale: 1, filter: 'brightness(1)', duration: 0.38, ease: 'back.out(1.6)' },
        0,
      );
    }

    return () => {
      tl.kill();
    };
  }, [equippedItemId]);

  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen pb-20 bg-bangul">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">

        {/* Page header */}
        <div className="mb-8">
          <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">인벤토리</h1>
          <p className="mt-1 text-sm muted">보유 중인 아이템과 장착 상태를 확인하세요.</p>
        </div>

        {/* Points balance card */}
        <div className="mb-6 rounded-3xl card-glass p-6 relative overflow-hidden">
          {/* Decorative ambient blobs */}
          <div className="absolute -top-8 -right-8 h-40 w-40 rounded-full bg-[color:var(--accent-pink)]/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-[color:var(--accent-lavender)]/12 blur-2xl pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--accent-pink)]/5 via-transparent to-[color:var(--accent-lavender)]/7 pointer-events-none" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <m.div
                className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[color:var(--accent-pink)] to-[color:var(--accent-lavender)] shadow-lg"
                whileHover={{ scale: 1.07, rotate: 6 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              >
                {/* Shimmer on the icon */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full animate-shimmer-slow" />
                </div>
                <Sparkles className="h-7 w-7 text-white relative z-10" />
              </m.div>

              <div>
                <div className="text-xs font-semibold muted mb-1 uppercase tracking-wider">보유 포인트</div>
                {loading || !data ? (
                  <Skeleton className="h-8 w-28" />
                ) : (
                  <m.div
                    key={data.balance}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-3xl font-bold bg-gradient-to-r from-[color:var(--accent-pink)] via-[color:var(--accent-pink-2)] to-[color:var(--accent-lavender)] bg-clip-text text-transparent"
                  >
                    {(data?.balance ?? 0).toLocaleString()} P
                  </m.div>
                )}
              </div>
            </div>

            {/* Decorative star cluster */}
            <div className="hidden sm:flex flex-col items-end gap-1 opacity-20 pointer-events-none select-none" aria-hidden="true">
              <Star className="h-3 w-3 text-[color:var(--accent-lemon)] fill-current animate-float" style={{ animationDelay: '0s' }} />
              <Star className="h-2 w-2 text-[color:var(--accent-pink)] fill-current animate-float" style={{ animationDelay: '0.6s' }} />
              <Star className="h-3.5 w-3.5 text-[color:var(--accent-lavender)] fill-current animate-float" style={{ animationDelay: '1.2s' }} />
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
            {/* Equipped item section */}
            {data?.equipped?.item && (
              <section ref={equippedSectionRef} className="mb-8">
                <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[color:var(--accent-mint)]" />
                  현재 장착 중
                </h2>

                <div
                  className={`
                    relative overflow-hidden rounded-3xl border-2 p-6
                    bg-gradient-to-br ${RARITY_COLORS[data.equipped.item.rarity]}
                    ${RARITY_EQUIPPED_GLOW[data.equipped.item.rarity]}
                    ${RARITY_SHINE_CLASS[data.equipped.item.rarity]}
                    animate-pulse-slow
                  `}
                >
                  {/* Ambient glow blob behind the card */}
                  <div className={`absolute -inset-2 opacity-30 blur-2xl pointer-events-none bg-gradient-to-br ${RARITY_COLORS[data.equipped.item.rarity]} animate-pulse-glow`} />

                  {/* Shimmer sweep (fallback for non-shine rarities) */}
                  {(data.equipped.item.rarity === 'R' || data.equipped.item.rarity === 'S') && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] animate-shimmer pointer-events-none" />
                  )}

                  {/* Animated border accent line */}
                  <div className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent`} />

                  <div className="relative z-10 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {/* Larger equipped icon with rarity ring */}
                      <div className={`relative rounded-2xl p-0.5 bg-gradient-to-br ${RARITY_COLORS[data.equipped.item.rarity]}`}>
                        <ItemIcon
                          url={data.equipped.item.roleIconUrl}
                          label={data.equipped.item.name}
                          frameClass="h-20 w-20"
                          imgClass="h-14 w-14"
                          emojiClass="text-4xl"
                        />
                        {/* Equipped badge on icon */}
                        <div className="absolute -bottom-1.5 -right-1.5 rounded-full bg-[color:var(--accent-mint)] p-0.5 shadow-lg">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>

                      <div>
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-2 text-xs font-bold mb-3 ${RARITY_TEXT_COLORS[data.equipped.item.rarity]} ${RARITY_BADGE_BG[data.equipped.item.rarity]}`}>
                          <Sparkles className="h-3 w-3" />
                          {data.equipped.item.rarity}
                        </div>
                        <div className="text-xl font-bold text-[color:var(--fg)]">{data.equipped.item.name}</div>
                        <div className="mt-1 text-xs muted">장착 중인 역할 아이템</div>
                      </div>
                    </div>

                    <button
                      onClick={() => void handleUnequip()}
                      disabled={equipLoading}
                      className="shrink-0 rounded-xl btn-soft px-5 py-2.5 text-sm font-semibold disabled:opacity-50 cursor-pointer hover:scale-105 transition-transform"
                    >
                      {equipLoading ? '처리 중…' : '장착 해제'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Inventory section */}
            <section>
              <h2 className="mb-4 text-lg font-semibold flex items-center gap-2">
                <Package className="h-5 w-5 text-[color:var(--accent-sky)]" />
                보유 아이템
              </h2>

              {!data?.inventory || data.inventory.length === 0 ? (
                /* Empty state */
                <div className="rounded-3xl card-glass p-14 text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--accent-sky)]/5 to-transparent pointer-events-none" />
                  <m.div
                    className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-[color:var(--border)] bg-[color:var(--chip)]/60"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Package className="h-12 w-12 text-[color:var(--muted-2)]" />
                    <div className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-[color:var(--accent-lavender)]/40 blur-sm" />
                  </m.div>
                  <p className="text-base font-semibold mb-1">아이템이 없어요</p>
                  <p className="text-sm muted mb-6">뽑기를 통해 첫 아이템을 획득해보세요!</p>
                  <a
                    href="/draw"
                    className="inline-block rounded-xl btn-bangul px-7 py-3 text-sm font-semibold"
                  >
                    뽑기 하러 가기
                  </a>
                </div>
              ) : (
                <>
                  {/* Search bar */}
                  <div className="mb-5 rounded-3xl card-glass p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted-2)]" />
                        <input
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          placeholder="아이템 이름 검색…"
                          className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] pl-11 pr-11 py-3 text-sm text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/35 focus:border-[color:var(--accent-pink)]/40 transition-[box-shadow,border-color]"
                        />
                        {search ? (
                          <button
                            type="button"
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[color:var(--muted-2)] hover:bg-[color:var(--bg)]/50 hover:text-[color:var(--fg)] transition cursor-pointer"
                            aria-label="검색어 지우기"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <div className="text-xs muted">
                          <span className="font-semibold text-[color:var(--fg)]">{filteredItems.length.toLocaleString()}</span>
                          <span> / {allItems.length.toLocaleString()} 개</span>
                        </div>
                        {query ? (
                          <span className="rounded-full border border-[color:var(--accent-pink)]/30 bg-[color:var(--accent-pink)]/8 px-3 py-1 text-xs font-semibold text-[color:var(--accent-pink)]">
                            &quot;{search.trim()}&quot;
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* No search results */}
                  {allItems.length > 0 && filteredItems.length === 0 ? (
                    <div className="rounded-3xl card-glass p-12 text-center">
                      <m.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60"
                      >
                        <Search className="h-8 w-8 text-[color:var(--muted-2)]" />
                      </m.div>
                      <p className="text-sm font-semibold mb-1">검색 결과 없음</p>
                      <p className="text-xs muted mb-4">&quot;{search.trim()}&quot; 에 해당하는 아이템이 없습니다.</p>
                      <button
                        type="button"
                        className="inline-flex rounded-xl btn-soft px-6 py-2.5 text-sm font-semibold cursor-pointer"
                        onClick={() => setSearch('')}
                      >
                        검색어 지우기
                      </button>
                    </div>
                  ) : (
                    /* Item grid container */
                    <div className="relative rounded-[32px] border border-[color:var(--border)] bg-[color:var(--card)]/60 p-3 sm:p-4 shadow-[0_18px_45px_rgba(10,10,18,0.35)] overflow-hidden">
                      {/* Ambient gradient decoration */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.08),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(255,191,36,0.07),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(147,197,253,0.07),transparent_45%)] pointer-events-none" />
                      {/* Subtle grid lines */}
                      <div className="absolute inset-0 opacity-50 bg-[linear-gradient(0deg,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none" />

                      <div ref={gridRef} className="relative grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                        <AnimatePresence mode="popLayout">
                          {filteredItems.map((inv, idx) => {
                            const isEquipped = equippedItemId === inv.itemId;
                            const shineClass = RARITY_SHINE_CLASS[inv.item.rarity];
                            return (
                              <m.div
                                key={inv.itemId}
                                data-inventory-card
                                data-item-id={inv.itemId}
                                layout
                                layoutId={`inv-${inv.itemId}`}
                                exit={{ opacity: 0, scale: 0.94 }}
                                whileHover={{ scale: 1.04, y: -5 }}
                                transition={{
                                  duration: 0.3,
                                  delay: idx * 0.05,
                                  type: 'spring',
                                  stiffness: 320,
                                  damping: 22
                                }}
                                className={`
                                  group flex flex-col items-center gap-2
                                  ${isEquipped ? `ring-2 ${RARITY_BORDER_EQUIPPED[inv.item.rarity]} ring-offset-2 ring-offset-[color:var(--card)] rounded-2xl` : ''}
                                `}
                              >
                                <button
                                  type="button"
                                  onClick={() => void (isEquipped ? handleUnequip() : handleEquip(inv.itemId))}
                                  disabled={equipLoading}
                                  className={`
                                    relative w-full aspect-square rounded-2xl border-2 p-2 transition-all duration-200
                                    bg-gradient-to-br ${RARITY_COLORS[inv.item.rarity]}
                                    ${RARITY_GLOW_BASE[inv.item.rarity]}
                                    ${RARITY_GLOW_HOVER[inv.item.rarity]}
                                    ${shineClass}
                                    shadow-[inset_0_0_0_1px_rgba(255,255,255,0.09),0_8px_18px_rgba(0,0,0,0.22)]
                                    hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_14px_28px_rgba(0,0,0,0.32)]
                                    ${isEquipped
                                      ? `${RARITY_BORDER_EQUIPPED[inv.item.rarity]} ${RARITY_EQUIPPED_GLOW[inv.item.rarity]}`
                                      : 'border-[color:var(--border)]'
                                    }
                                    disabled:opacity-60 cursor-pointer
                                    overflow-hidden
                                  `}
                                  aria-label={isEquipped ? '장착 해제' : '장착하기'}
                                >
                                  {/* Hover sweep shimmer (R only — S/SS/SSS use CSS ::before) */}
                                  {inv.item.rarity === 'R' && (
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none z-10" />
                                  )}

                                  {/* Quantity badge */}
                                  <div className="absolute top-1.5 right-1.5 z-20">
                                    <div className="rounded-full bg-[color:var(--chip)]/90 backdrop-blur-sm px-1.5 py-0.5 text-[10px] font-bold border border-[color:var(--border)] shadow-sm leading-none">
                                      ×{inv.qty}
                                    </div>
                                  </div>

                                  {/* Equipped badge */}
                                  {isEquipped && (
                                    <div className="absolute bottom-1.5 left-1.5 z-20 rounded-full bg-[color:var(--accent-mint)] px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md leading-none">
                                      장착
                                    </div>
                                  )}

                                  {/* Rarity badge */}
                                  <div className="absolute top-1.5 left-1.5 z-20">
                                    <div className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[10px] font-bold leading-none ${RARITY_TEXT_COLORS[inv.item.rarity]} ${RARITY_BADGE_BG[inv.item.rarity]}`}>
                                      {inv.item.rarity}
                                    </div>
                                  </div>

                                  {/* Icon */}
                                  <div className="relative flex h-full w-full items-center justify-center">
                                    <ItemIcon
                                      url={inv.item.roleIconUrl}
                                      label={inv.item.name}
                                      frameClass="h-14 w-14 bg-[color:var(--bg)]/30 border border-[color:var(--border)] shadow-[inset_0_0_10px_rgba(0,0,0,0.20)]"
                                      imgClass="h-10 w-10"
                                      emojiClass="text-2xl"
                                    />
                                  </div>

                                  {/* Name label */}
                                  <div
                                    className="absolute bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--fg)] bg-[color:var(--chip)]/85 backdrop-blur-sm border border-[color:var(--border)] rounded-lg shadow-sm truncate max-w-[82%] leading-tight"
                                    title={inv.item.name}
                                  >
                                    {inv.item.name}
                                  </div>
                                </button>

                                <div className="text-center w-full">
                                  <div className="text-[10px] muted leading-none">
                                    {equipLoading ? '처리 중…' : isEquipped ? '장착 중' : '클릭하여 장착'}
                                  </div>
                                </div>
                              </m.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
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
