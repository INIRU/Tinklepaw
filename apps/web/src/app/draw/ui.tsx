'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { GachaScene } from './GachaScene';
import { AnimatePresence, m } from 'framer-motion';
import gsap from 'gsap';
import { X, Info, Coins, AlertCircle, ChevronDown, History, Copy, Download, Search, Sparkles, Settings2 } from 'lucide-react';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/Skeleton';
import { useSearchParams } from 'next/navigation';
import { CustomSelect } from '@/components/ui/CustomSelect';

type DrawResult = {
  itemId: string;
  name: string;
  rarity: 'R' | 'S' | 'SS' | 'SSS';
  discordRoleId: string | null;
  rewardPoints?: number;
  roleIconUrl?: string | null;
  isVariant?: boolean;
};

type Pool = {
  pool_id: string;
  name: string;
  kind: 'permanent' | 'limited';
  is_active: boolean;
  banner_image_url: string | null;
  cost_points: number;
  free_pull_interval_seconds: number | null;
  paid_pull_cooldown_seconds: number;
  pity_threshold: number | null;
  pity_rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
  rate_r: number;
  rate_s: number;
  rate_ss: number;
  rate_sss: number;
  start_at?: string | null;
  end_at?: string | null;
};

type HistoryEntry = {
  pullId: string;
  createdAt: string;
  pool: { poolId: string; name: string | null; kind: 'permanent' | 'limited' | null };
  isFree: boolean;
  spentPoints: number;
  result: {
    itemId: string;
    name: string | null;
    rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
    discordRoleId: string | null;
    rewardPoints: number;
    qty: number;
    isPity: boolean;
    isVariant?: boolean;
  } | null;
};

type PoolItem = {
  itemId: string;
  name: string;
  rarity: 'R' | 'S' | 'SS' | 'SSS';
  discordRoleId: string | null;
  rewardPoints: number;
  roleIconUrl?: string | null;
};

type UserStatus = {
  balance: number;
  pityCounter: number;
  freeAvailableAt?: string | null;
  paidAvailableAt?: string | null;
};

const toSafeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const RARITY_PRIORITY: Record<DrawResult['rarity'], number> = {
  R: 1,
  S: 2,
  SS: 3,
  SSS: 4
};

const RARITY_DISPLAY_ORDER = ['SSS', 'SS', 'S', 'R'] as const;

const clampBulkDrawCount = (value: number) => {
  if (!Number.isFinite(value)) return 10;
  return Math.max(10, Math.min(100, Math.trunc(value)));
};

function getResultLabel(item: DrawResult) {
  const reward = item.rewardPoints ?? 0;
  if (!item.discordRoleId && reward > 0) return `+${reward}P`;
  if (!item.discordRoleId && reward === 0) return '꽝';
  return item.name;
}

const PityGauge = ({
  current,
  max,
  rarity
}: {
  current: number;
  max: number;
  rarity?: 'R' | 'S' | 'SS' | 'SSS' | null;
}) => {
  const remaining = Math.max(max - current, 0);
  return (
  <div className='mt-2 w-full max-w-[200px] mx-auto backdrop-blur-sm bg-[color:var(--card)]/50 p-2 rounded-xl border border-[color:var(--border)] shadow-sm'>
    <div className='flex justify-between text-[10px] text-[color:var(--muted)] mb-1 px-1 font-semibold'>
      <span>
        천장{rarity ? ` ${rarity}` : ''}
      </span>
      <span>
        남은 {remaining}회
      </span>
    </div>
    <div className='h-2 w-full bg-black/5 dark:bg-black/40 rounded-full overflow-hidden border border-[color:var(--border)]'>
      <div
        className='h-full bg-gradient-to-r from-[color:var(--accent-pink)] to-pink-400 transition-all duration-500 shadow-[0_0_10px_rgba(255,95,162,0.5)]'
        style={{ width: `${Math.min((current / max) * 100, 100)}%` }}
      />
    </div>
  </div>
  );
};

export default function DrawClient() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');

  // User Status
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [showProbModal, setShowProbModal] = useState(false);
  const [openRarities, setOpenRarities] = useState<
    Record<'SSS' | 'SS' | 'S' | 'R', boolean>
  >({
    SSS: false,
    SS: false,
    S: false,
    R: false,
  });

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyInFlight = useRef(false);
  const historyOffsetRef = useRef(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyPoolId, setHistoryPoolId] = useState<string>('');
  const [historyRarities, setHistoryRarities] = useState<
    Record<'R' | 'S' | 'SS' | 'SSS', boolean>
  >({ R: true, S: true, SS: true, SSS: true });
  const [historyQueryInput, setHistoryQueryInput] = useState('');
  const [historyQuery, setHistoryQuery] = useState('');
  const [openHistoryGroups, setOpenHistoryGroups] = useState<Record<string, boolean>>({});
  const [historyFocusPullId, setHistoryFocusPullId] = useState<string | null>(
    null,
  );
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showPoolListMobile, setShowPoolListMobile] = useState(false);
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [poolItemsLoading, setPoolItemsLoading] = useState(false);

  // Animation & Result State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawResults, setDrawResults] = useState<DrawResult[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [bulkDrawCount, setBulkDrawCount] = useState(10);
  const [showBulkDrawSettings, setShowBulkDrawSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const resultModalRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotionRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('nyaru:web:draw:bulk-count');
    if (!saved) return;
    setBulkDrawCount(clampBulkDrawCount(Number(saved)));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('nyaru:web:draw:bulk-count', String(bulkDrawCount));
  }, [bulkDrawCount]);

  // Computed
  // Avoid leaking "변동" upgrades in the initial capsule/scene.
  // If SSS is present only via variant, show the best non-variant rarity in the scene,
  // and reveal the actual upgraded SSS in the result modal.
  const sceneRarity = useMemo<DrawResult['rarity'] | null>(() => {
    if (drawResults.length === 0) return null;

    const hasNaturalSSS = drawResults.some(
      (r) => r.rarity === 'SSS' && !r.isVariant,
    );
    if (hasNaturalSSS) return 'SSS';

    const withoutVariantSSS = drawResults.filter(
      (r) => !(r.rarity === 'SSS' && r.isVariant),
    );
    if (withoutVariantSSS.length === 0) return 'SS';

    return withoutVariantSSS.reduce((prev, curr) =>
      RARITY_PRIORITY[curr.rarity] > RARITY_PRIORITY[prev.rarity] ? curr : prev,
    ).rarity;
  }, [drawResults]);

  useEffect(() => {
    if (!showResultModal || drawResults.length === 0) return;

    const modal = resultModalRef.current;
    if (!modal) return;

    const reduced = prefersReducedMotionRef.current;
    const cards = Array.from(modal.querySelectorAll<HTMLElement>('[data-result-card]'));

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });

    tl.fromTo(
      modal,
      { autoAlpha: 0, y: reduced ? 0 : 12, scale: reduced ? 1 : 0.98 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: reduced ? 0.05 : 0.28,
        ease: 'power2.out'
      }
    );

    if (cards.length > 0) {
      tl.fromTo(
        cards,
        { autoAlpha: 0, y: reduced ? 0 : 20, scale: reduced ? 1 : 0.94 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: reduced ? 0.05 : 0.38,
          stagger: reduced ? 0 : 0.05,
          ease: 'power3.out'
        },
        '-=0.12'
      );

      if (!reduced) {
        const premiumCards = cards.filter((card) => {
          const rarity = card.dataset.rarity;
          return rarity === 'SS' || rarity === 'SSS';
        });

        if (premiumCards.length > 0) {
          tl.fromTo(
            premiumCards,
            { scale: 1 },
            {
              scale: 1.04,
              duration: 0.22,
              ease: 'sine.inOut',
              yoyo: true,
              repeat: 1,
              stagger: 0.06
            },
            '-=0.16'
          );
        }
      }
    }

    return () => {
      tl.kill();
    };
  }, [drawResults, showResultModal]);

  useEffect(() => {
    fetch('/api/gacha/pools')
      .then((r) =>
        r.json().then((body) => ({ ok: r.ok, status: r.status, body })),
      )
      .then(({ ok, status, body }) => {
        if (!ok)
          throw new Error(
            (body as { error?: string } | null)?.error ?? `HTTP ${status}`,
          );
        const loaded = (
          (body as { pools?: Pool[] } | null)?.pools ?? []
        ).filter((p) => p.is_active);
        setPools(loaded);
        setSelectedPoolId((prev) => {
          if (prev && loaded.some((p) => p.pool_id === prev)) return prev;
          return loaded[0]?.pool_id || '';
        });
      })
      .catch((e) =>
        toast.error(
          e instanceof Error ? e.message : '뽑기 목록을 불러오지 못했습니다.',
        ),
      );
  }, [toast]);

  const selectedPool = useMemo(
    () => pools.find((p) => p.pool_id === selectedPoolId) ?? null,
    [pools, selectedPoolId],
  );

  const itemsByRarity = useMemo(() => {
    const grouped: Record<'R' | 'S' | 'SS' | 'SSS', PoolItem[]> = {
      R: [],
      S: [],
      SS: [],
      SSS: []
    };
    poolItems.forEach((item) => {
      grouped[item.rarity]?.push(item);
    });
    return grouped;
  }, [poolItems]);

  const activeHistoryRarities = useMemo(() => {
    return RARITY_DISPLAY_ORDER.filter((r) => historyRarities[r]);
  }, [historyRarities]);

  const historyGroups = useMemo(() => {
    const MAX = 10;
    const ADJ_MS = 3500;
    const WINDOW_MS = 20000;

    const groups: Array<{ key: string; entries: HistoryEntry[]; isTenPull: boolean }> = [];
    const entries = historyEntries;

    let i = 0;
    while (i < entries.length) {
      const first = entries[i];
      const firstT = new Date(first.createdAt).getTime();
      const poolId = first.pool.poolId;

      const group: HistoryEntry[] = [first];
      let prevT = firstT;
      let j = i + 1;

      while (j < entries.length && group.length < MAX) {
        const next = entries[j];
        if (next.pool.poolId !== poolId) break;

        const nextT = new Date(next.createdAt).getTime();
        const dtAdj = prevT - nextT;
        const dtWindow = firstT - nextT;

        if (dtAdj > ADJ_MS) break;
        if (dtWindow > WINDOW_MS) break;

        group.push(next);
        prevT = nextT;
        j += 1;
      }

      if (group.length === MAX) {
        groups.push({ key: group[0].pullId, entries: group, isTenPull: true });
        i = j;
      } else {
        groups.push({ key: first.pullId, entries: [first], isTenPull: false });
        i += 1;
      }
    }

    return groups;
  }, [historyEntries]);

  const fetchStatus = useCallback(async () => {
    try {
      const url = selectedPoolId
        ? `/api/gacha/status?poolId=${selectedPoolId}`
        : '/api/gacha/status';
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as Partial<UserStatus>;
        setUserStatus({
          balance: Math.floor(toSafeNumber(data.balance)),
          pityCounter: Math.max(0, Math.floor(toSafeNumber(data.pityCounter))),
          freeAvailableAt: data.freeAvailableAt ?? null,
          paidAvailableAt: data.paidAvailableAt ?? null,
        });
      }
    } catch (e) {
      console.error('[DrawClient] fetchStatus failed:', e);
    }
  }, [selectedPoolId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!showProbModal || !selectedPoolId) return;
    let canceled = false;

    setPoolItemsLoading(true);
    fetch(`/api/gacha/pool-items?poolId=${selectedPoolId}`)
      .then((r) => r.json())
      .then((body) => {
        if (canceled) return;
        setPoolItems((body?.items ?? []) as PoolItem[]);
      })
      .catch((e) => {
        if (canceled) return;
        console.error('[DrawClient] Failed to load pool items:', e);
        setPoolItems([]);
      })
      .finally(() => {
        if (canceled) return;
        setPoolItemsLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [selectedPoolId, showProbModal]);

  useEffect(() => {
    if (!showProbModal) return;
    setOpenRarities({
      SSS: false,
      SS: false,
      S: false,
      R: false,
    });
  }, [showProbModal]);

  useEffect(() => {
    const shouldOpen = searchParams.get('history') === '1';
    const focusPull = searchParams.get('focusPull');
    if (!shouldOpen && !focusPull) return;

    setShowHistoryModal(true);
    if (focusPull) setHistoryFocusPullId(focusPull);
  }, [searchParams]);

  useEffect(() => {
    if (!showHistoryModal) return;
    const t = setTimeout(() => {
      setHistoryQuery(historyQueryInput.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [historyQueryInput, showHistoryModal]);

  const fetchHistory = useCallback(
    async ({ reset }: { reset?: boolean } = {}) => {
      if (historyInFlight.current) return;
      const nextOffset = reset ? 0 : historyOffsetRef.current;

      historyInFlight.current = true;
      setHistoryLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set('limit', '30');
        qs.set('offset', String(nextOffset));
        if (historyPoolId) qs.set('poolId', historyPoolId);
        if (activeHistoryRarities.length > 0 && activeHistoryRarities.length < 4) {
          qs.set('rarities', activeHistoryRarities.join(','));
        }
        if (historyQuery) qs.set('q', historyQuery);

        const res = await fetch(`/api/gacha/history?${qs.toString()}`);
        const body = (await res.json().catch(() => null)) as
          | { entries?: HistoryEntry[]; nextOffset?: number; exhausted?: boolean; error?: string }
          | null;

        if (!res.ok) {
          throw new Error(body?.error ?? `요청 실패: ${res.status}`);
        }

        const entries = (body?.entries ?? []) as HistoryEntry[];
        const returnedNextOffset = typeof body?.nextOffset === 'number' ? body.nextOffset : nextOffset;

        setHistoryEntries((prev) => (reset ? entries : [...prev, ...entries]));
        historyOffsetRef.current = returnedNextOffset;
        setHistoryHasMore(Boolean(!body?.exhausted && entries.length > 0));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '내역을 불러오지 못했습니다.');
      } finally {
        historyInFlight.current = false;
        setHistoryLoading(false);
      }
    },
    [
      activeHistoryRarities,
      historyInFlight,
      historyPoolId,
      historyOffsetRef,
      historyQuery,
      toast,
    ],
  );

  const downloadHistoryCsv = useCallback(() => {
    if (historyEntries.length === 0) {
      toast.error('내역이 없습니다.');
      return;
    }

    const csvEscape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      const escaped = s.replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${escaped}"` : escaped;
    };

    const header = [
      'createdAt',
      'poolName',
      'poolId',
      'rarity',
      'itemName',
      'isPity',
      'isFree',
      'spentPoints',
      'rewardPoints',
      'pullId',
      'sharePath',
    ];

    const lines = [header.join(',')];

    for (const e of historyEntries) {
      const createdAt = e.createdAt;
      const poolName = e.pool.name ?? '';
      const poolId = e.pool.poolId;
      const rarity = e.result?.rarity ?? '';
      const itemName = e.result?.name ?? '';
      const isPity = e.result?.isPity ? 1 : 0;
      const isFree = e.isFree ? 1 : 0;
      const spentPoints = e.spentPoints ?? 0;
      const rewardPoints = e.result?.rewardPoints ?? 0;
      const pullId = e.pullId;
      const sharePath = `/draw?history=1&focusPull=${encodeURIComponent(pullId)}`;

      lines.push(
        [
          createdAt,
          poolName,
          poolId,
          rarity,
          itemName,
          isPity,
          isFree,
          spentPoints,
          rewardPoints,
          pullId,
          sharePath,
        ]
          .map(csvEscape)
          .join(','),
      );
    }

    const csv = lines.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `gacha-history-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast.success('CSV를 다운로드했습니다.');
  }, [historyEntries, toast]);

  useEffect(() => {
    if (!showHistoryModal) return;
    historyOffsetRef.current = 0;
    setHistoryHasMore(true);
    setOpenHistoryGroups({});
    setHistoryEntries([]);
    void fetchHistory({ reset: true });
  }, [activeHistoryRarities, fetchHistory, historyPoolId, showHistoryModal]);

  useEffect(() => {
    if (!showHistoryModal || !historyFocusPullId) return;
    if (historyLoading) return;

    const el = document.getElementById(`pull-${historyFocusPullId}`);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      return;
    }

    const groupKey = historyGroups.find(
      (g) => g.isTenPull && g.entries.some((x) => x.pullId === historyFocusPullId),
    )?.key;
    if (groupKey && !openHistoryGroups[groupKey]) {
      setOpenHistoryGroups((prev) => ({ ...prev, [groupKey]: true }));
    }
  }, [
    historyFocusPullId,
    historyGroups,
    historyLoading,
    openHistoryGroups,
    showHistoryModal,
  ]);

  const onDraw = useCallback(
    async (amount: number) => {
      if (busy || isDrawing || !selectedPool) return;

      const totalCost = selectedPool.cost_points * amount;
      if ((userStatus?.balance ?? 0) < totalCost) {
        setShowInsufficientModal(true);
        return;
      }

      setBusy(true);
      setDrawResults([]);
      setShowResultModal(false);

      await new Promise((resolve) => setTimeout(resolve, 0));

      try {
        const res = await fetch('/api/gacha/draw', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poolId: selectedPoolId || null, amount }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `요청 실패: ${res.status}`);
        }

        const data = (await res.json()) as {
          results?: DrawResult[];
          itemId?: string;
          partial?: boolean;
          warning?: string | null;
          requestedAmount?: number;
          completedAmount?: number;
        };
        let completedCount = 0;
        if (data.results) {
          setDrawResults(data.results);
          completedCount = data.results.length;
        } else if (data.itemId) {
          setDrawResults([data as unknown as DrawResult]);
          completedCount = 1;
        } else {
          throw new Error('Invalid response format');
        }

        if (data.partial || completedCount < amount) {
          toast.error(
            data.warning ??
              `일시 오류로 ${completedCount}/${amount}회만 완료되었습니다. 잠시 후 다시 시도해주세요.`,
          );
        }

        fetchStatus();
        setIsDrawing(true);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.',
        );
        setBusy(false);
      }
    },
    [
      busy,
      isDrawing,
      selectedPool,
      selectedPoolId,
      userStatus,
      toast,
      fetchStatus,
    ],
  );

  const onAnimationComplete = useCallback(() => {
    setIsDrawing(false);
    setShowResultModal(true);
    setBusy(false);
  }, []);

  const RESULT_SLOT = {
    R: {
      frame: 'border-slate-400/35 bg-slate-500/8',
      text: 'text-slate-200',
      glow: '',
      shimmer: 'from-slate-300/6 via-slate-100/3 to-transparent'
    },
    S: {
      frame: 'border-sky-400/45 bg-sky-500/10',
      text: 'text-sky-200',
      glow: 'shadow-[0_0_20px_rgba(56,189,248,0.25)]',
      shimmer: 'from-sky-300/10 via-sky-100/4 to-transparent'
    },
    SS: {
      frame: 'border-rose-400/45 bg-rose-500/12',
      text: 'text-rose-200',
      glow: 'shadow-[0_0_24px_rgba(251,113,133,0.3)]',
      shimmer: 'from-rose-300/12 via-rose-100/5 to-transparent'
    },
    SSS: {
      frame: 'border-amber-300/55 bg-amber-400/12',
      text: 'text-amber-200',
      glow: 'shadow-[0_0_34px_rgba(251,191,36,0.38)]',
      shimmer: 'from-amber-300/15 via-amber-100/8 to-transparent'
    }
  } as const;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const isoToMs = (iso?: string | null) => {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const startOfDayMs = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const formatAt = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  };
  const formatDDay = (endIso?: string | null) => {
    const endMs = isoToMs(endIso);
    if (!endMs) return null;
    const days = Math.floor((startOfDayMs(endMs) - startOfDayMs(nowMs)) / 86400000);
    if (days <= 0) return 'D-Day';
    return `D-${days}`;
  };

  const formatPct2 = (v: number) => {
    if (!Number.isFinite(v)) return '0.00';
    return v.toFixed(2);
  };

  const variantStats = useMemo(() => {
    if (!selectedPool) return null;
    const r = Math.max(0, Math.min(100, selectedPool.rate_sss ?? 0)) / 100;
    const v = r / 10; // 1/10 of SSS rate (current policy)
    const effectiveSSS = r + (1 - r) * v;
    const variantMark = (1 - r) * v;
    return {
      baseSSSRate: r,
      variantRollRate: v,
      effectiveSSSRate: effectiveSSS,
      variantMarkRate: variantMark
    };
  }, [selectedPool]);
  const formatRemaining = (targetMs: number) => {
    const diff = targetMs - nowMs;
    if (diff <= 0) return '종료됨';
    const totalMin = Math.floor(diff / 60000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const mins = totalMin % 60;
    if (days > 0) return `${days}일 ${hours}시간`;
    if (hours > 0) return `${hours}시간 ${mins}분`;
    if (mins > 0) return `${mins}분`;
    return '1분 미만';
  };

  return (
    <main className='flex h-[calc(100vh-64px)] h-[calc(100dvh-64px)] min-h-[calc(100svh-64px)] overflow-hidden overflow-x-hidden'>
      {/* Left Sidebar - Pool List */}
      <aside
        className={`w-72 border-r border-[color:var(--border)] bg-[color:var(--card)] p-4 flex-shrink-0 z-10 hidden md:block ${
          pools.length > 0 ? 'overflow-y-auto' : 'overflow-y-hidden'
        }`}
      >
        <div className='text-[11px] tracking-[0.28em] muted-2 mb-6'>
          BANGULNYANG
        </div>
        <h1 className='text-xl font-bold tracking-tight mb-1 font-bangul'>
          가챠
        </h1>
        <p className='text-xs muted mb-6'>원하는 풀을 선택하세요.</p>

        <div className='space-y-3'>
          {pools.length === 0 &&
            [1, 2, 3].map((i) => (
              <div
                key={i}
                className='rounded-2xl border border-[color:var(--border)] p-3'
              >
                <Skeleton className='aspect-[8/3] w-full rounded-xl mb-3' />
                <Skeleton className='h-4 w-3/4 mb-2' />
                <Skeleton className='h-3 w-1/2' />
              </div>
            ))}
          {pools.length > 0 &&
            pools.map((p) => (
              <button
                key={p.pool_id}
                type='button'
                className={`w-full text-left rounded-2xl border p-3 transition-all cursor-pointer group ${
                  selectedPoolId === p.pool_id
                    ? 'border-[color:var(--border)] bg-[color:var(--chip)] shadow-lg'
                    : 'border-transparent hover:bg-[color:var(--chip)]/50'
                }`}
                onClick={() => !isDrawing && setSelectedPoolId(p.pool_id)}
                disabled={isDrawing}
              >
                <div className='aspect-[8/3] overflow-hidden rounded-xl border border-[color:var(--border)] bg-black/5 relative'>
                  <Image
                    src={p.banner_image_url ?? '/banner.png'}
                    alt={p.name}
                    fill
                    className='object-cover transition-transform duration-500 group-hover:scale-105'
                  />
                </div>
                <div className='mt-3'>
                  <div className='text-sm font-bold truncate'>{p.name}</div>
                  <div className='mt-1 flex items-center gap-2 text-xs muted'>
                    <span
                      className={
                        p.kind === 'limited'
                          ? 'text-[color:var(--accent-pink)]'
                          : ''
                      }
                    >
                      {p.kind === 'permanent' ? '상시' : '한정'}
                    </span>
                    {p.kind === 'limited' && p.end_at && (
                      (() => {
                        const dDay = formatDDay(p.end_at);
                        if (!dDay) return null;
                        return (
                          <span className='inline-flex items-center rounded-full border border-[color:var(--accent-pink)]/30 bg-[color:var(--accent-pink)]/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent-pink)] font-mono'>
                            {dDay}
                          </span>
                        );
                      })()
                    )}
                    <span>•</span>
                    <span>{p.cost_points}P</span>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </aside>

      {/* Main Content - 3D Scene */}
      <div className='flex-1 relative'>
        <div className='absolute inset-0 z-0'>
          <GachaScene
            isDrawing={isDrawing}
            rarity={sceneRarity ?? undefined}
            poolBannerUrl={selectedPool?.banner_image_url ?? null}
            poolName={selectedPool?.name ?? null}
            onAnimationCompleteAction={onAnimationComplete}
          />
        </div>

        <div className='pointer-events-none absolute inset-0 z-[1]'>
          <div className='absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,153,199,0.28),transparent_56%)]' />
          <div className='absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/24 via-black/8 to-transparent' />
          <div className='absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/42 via-black/16 to-transparent' />
        </div>

        {/* Overlay UI */}
        <div
          className={`absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5 transition-opacity duration-500 ${isDrawing ? 'opacity-0' : 'opacity-100'}`}
        >
          {/* Top Left Info (Mobile) */}
          <div className='absolute top-[calc(env(safe-area-inset-top)+0.75rem)] left-4 pointer-events-auto flex md:hidden items-center gap-2'>
            <button
              onClick={() => setShowProbModal(true)}
              className='flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)] text-[color:var(--muted)] shadow-sm cursor-pointer'
              title='확률 정보'
            >
              <Info className='w-4 h-4' />
            </button>
            <button
              onClick={() => {
                setHistoryPoolId((prev) => prev || selectedPoolId);
                setShowHistoryModal(true);
              }}
              className='flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)] text-[color:var(--muted)] shadow-sm cursor-pointer'
              title='뽑기 내역'
            >
              <History className='w-4 h-4' />
            </button>
          </div>

          <div className='absolute top-[calc(env(safe-area-inset-top)+0.75rem)] right-4 z-20 pointer-events-auto'>
            <div className='flex items-center gap-2'>
              <div className='flex h-9 items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/86 px-3 shadow-[0_8px_22px_rgba(0,0,0,0.2)] backdrop-blur-md'>
                <span className='text-xs font-bold text-[color:var(--accent-pink)]'>
                  {userStatus ? (
                    `${toSafeNumber(userStatus.balance).toLocaleString()} p`
                  ) : (
                    <Skeleton className='h-4 w-12 sm:w-16 inline-block align-middle' />
                  )}
                </span>
              </div>

              <div className='relative'>
                <button
                  type='button'
                  onClick={() => setShowBulkDrawSettings((prev) => !prev)}
                  className='flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/86 text-[color:var(--muted)] shadow-[0_8px_22px_rgba(0,0,0,0.2)] backdrop-blur-md transition-colors hover:text-[color:var(--fg)] cursor-pointer'
                  title='연속 뽑기 설정'
                >
                  <Settings2 className='h-4 w-4' />
                </button>

                <AnimatePresence>
                  {showBulkDrawSettings ? (
                    <m.div
                      initial={{ opacity: 0, y: -6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.96 }}
                      transition={{ duration: 0.16, ease: 'easeOut' }}
                      className='absolute right-0 mt-2 w-56 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/92 p-3 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-md'
                    >
                      <div className='mb-2 flex items-center justify-between'>
                        <span className='text-[11px] font-semibold text-[color:var(--fg)]'>연속 뽑기 횟수</span>
                        <span className='text-[11px] font-bold text-[color:var(--accent-pink)]'>{bulkDrawCount}회</span>
                      </div>

                      <input
                        type='range'
                        min={10}
                        max={100}
                        step={1}
                        value={bulkDrawCount}
                        onChange={(e) => setBulkDrawCount(clampBulkDrawCount(Number(e.target.value)))}
                        className='w-full accent-[color:var(--accent-pink)]'
                      />

                      <input
                        type='number'
                        min={10}
                        max={100}
                        value={bulkDrawCount}
                        onChange={(e) => setBulkDrawCount(clampBulkDrawCount(Number(e.target.value)))}
                        className='mt-2 h-8 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--chip)] px-2 text-xs text-[color:var(--fg)]'
                      />

                      <p className='mt-2 text-[10px] muted'>웹 연속 뽑기는 10~100회까지 설정할 수 있어요.</p>
                    </m.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Header */}
          <div className='flex flex-col items-center pt-16 sm:pt-4 w-full'>
            {selectedPool && (
              <>
                <m.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className='group mb-1.5 flex items-center gap-2 rounded-xl border border-[color:var(--accent-pink)]/30 bg-[color:var(--accent-pink)]/10 px-3 py-1.5 shadow-lg backdrop-blur-md pointer-events-auto cursor-pointer md:bg-[color:var(--card)]/80 md:border-[color:var(--border)] md:cursor-default'
                  onClick={() => setShowPoolListMobile(true)}
                >
                  <span className='text-[10px] font-bold text-[color:var(--accent-pink)] md:hidden'>
                    테마
                  </span>
                  <span className='text-[11px] sm:text-xs font-bold truncate max-w-[120px] sm:max-w-none'>
                    {selectedPool.name}
                  </span>
                  <ChevronDown className='w-3.5 h-3.5 text-[color:var(--accent-pink)] md:hidden' />
                </m.button>

                {selectedPool.pity_threshold && userStatus && (
                  <PityGauge
                    current={userStatus.pityCounter}
                    max={selectedPool.pity_threshold}
                    rarity={selectedPool.pity_rarity}
                  />
                )}
                {selectedPool.kind === 'limited' && (selectedPool.start_at || selectedPool.end_at) && (
                  (() => {
                    const startMs = isoToMs(selectedPool.start_at);
                    const endMs = isoToMs(selectedPool.end_at);
                    const range =
                      startMs && endMs
                        ? `${formatAt(startMs)} ~ ${formatAt(endMs)}`
                        : startMs
                          ? `${formatAt(startMs)} ~`
                          : endMs
                            ? `~ ${formatAt(endMs)}`
                            : null;
                    if (!range) return null;

                    const remaining = endMs ? formatRemaining(endMs) : null;
                    return (
                      <div className='mt-2 text-[10px] sm:text-xs text-center text-[color:var(--muted)]'>
                        <span className='inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)]'>
                          <span className='font-semibold text-[color:var(--fg)]'>기간</span>
                          <span className='font-mono'>{range}</span>
                          {endMs && (
                            <span className='rounded-full bg-[color:var(--chip)] border border-[color:var(--border)] px-2 py-0.5 font-semibold text-[color:var(--fg)]'>
                              남은 {remaining}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })()
                )}
              </>
            )}
          </div>

          {/* Footer / Controls */}
          <div className='pointer-events-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-6'>
            <div className='mx-auto w-full max-w-lg rounded-[22px] border border-[color:var(--border)] bg-[color:var(--card)]/86 p-2.5 shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-md sm:p-3'>
              <div className='mb-2.5 flex items-center justify-between gap-2 px-1 text-[9px] sm:text-[10px]'>
                <span className='font-semibold text-[color:var(--fg)]'>원하는 결과가 나올 때까지 이어서 뽑기</span>
                <span className='font-mono muted'>비용 {selectedPool?.cost_points ?? 0}P / 회</span>
              </div>

              <div className='grid grid-cols-2 gap-2.5'>
                <button
                  type='button'
                  onClick={() => void onDraw(1)}
                  disabled={busy || !selectedPoolId || isDrawing}
                  className={`
                    group relative overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 px-4 py-2.5 text-[color:var(--fg)] shadow-lg
                    transition-all duration-300 hover:-translate-y-0.5 hover:bg-[color:var(--chip)] active:translate-y-0
                    disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed cursor-pointer
                  `}
                >
                  <span className='relative z-10 flex flex-col items-center'>
                    <span className='text-xs font-bold'>1회 뽑기</span>
                    <span className='mt-0.5 text-[10px] muted'>
                      {selectedPool?.cost_points ?? 0}P
                    </span>
                  </span>
                </button>

                <button
                  type='button'
                  onClick={() => void onDraw(bulkDrawCount)}
                  disabled={busy || !selectedPoolId || isDrawing}
                  className={`
                    group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#ff5fa2] via-[#ff7f9f] to-[#ffac6d]
                    px-4 py-2.5 text-white shadow-lg shadow-rose-500/25
                    transition-all duration-300 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0
                    disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed cursor-pointer
                  `}
                >
                  <span className='relative z-10 flex flex-col items-center'>
                    {busy || isDrawing ? (
                      <span className='text-xs'>진행 중…</span>
                    ) : (
                      <>
                        <span className='text-xs font-bold'>{bulkDrawCount}회 연속</span>
                        <span className='mt-0.5 text-[10px] text-white/85'>
                          {(selectedPool?.cost_points ?? 0) * bulkDrawCount}P
                        </span>
                      </>
                    )}
                  </span>
                  <div className='absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0' />
                </button>
              </div>
            </div>
          </div>

          {/* Desktop Info */}
          <div className='absolute bottom-8 left-8 pointer-events-auto hidden md:flex flex-col gap-2'>
            <button
              onClick={() => setShowProbModal(true)}
              className='flex items-center gap-2 px-4 py-2 rounded-xl bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)] text-[color:var(--muted)] hover:bg-[color:var(--chip)] hover:text-[color:var(--fg)] transition-colors text-xs font-medium cursor-pointer'
            >
              <Info className='w-4 h-4' />
              <span>확률 정보</span>
            </button>
            <button
              onClick={() => {
                setHistoryPoolId((prev) => prev || selectedPoolId);
                setShowHistoryModal(true);
              }}
              className='flex items-center gap-2 px-4 py-2 rounded-xl bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)] text-[color:var(--muted)] hover:bg-[color:var(--chip)] hover:text-[color:var(--fg)] transition-colors text-xs font-medium cursor-pointer'
            >
              <History className='w-4 h-4' />
              <span>내역</span>
            </button>
          </div>
        </div>

        {/* Result Modal Overlay */}
        <AnimatePresence>
          {showResultModal && drawResults.length > 0 && (
            <div className='absolute inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(255,156,206,0.2),rgba(0,0,0,0.78))] p-2 backdrop-blur-sm sm:p-3'>
              <m.div
                ref={resultModalRef}
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className='relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[24px] border border-[color:var(--border)] bg-[color:var(--card)]/95 shadow-[0_28px_64px_rgba(0,0,0,0.42)]'
              >
                <div className='pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[color:var(--accent-pink)]/14 via-[color:var(--accent-pink)]/5 to-transparent' />

                <button
                  onClick={() => setShowResultModal(false)}
                  className='absolute top-4 right-4 z-20 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                >
                  <X className='w-5 h-5 text-[color:var(--muted)]' />
                </button>

                <div className='relative max-h-[90vh] overflow-y-auto px-3 pb-4 pt-4 sm:px-6 sm:pt-6'>
                  <div className='mb-4 text-center'>
                    <p className='text-[11px] tracking-[0.28em] muted-2'>DRAW COMPLETE</p>
                    <h2 className='mt-1 text-xl font-bold font-bangul sm:text-2xl'>뽑기 결과</h2>
                  </div>

                  <div
                    className={`grid gap-2.5 sm:gap-3 ${drawResults.length === 1 ? 'mx-auto max-w-xs place-items-center' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'}`}
                  >
                    {drawResults.map((item, idx) => {
                      const rarityStyle = RESULT_SLOT[item.rarity] ?? RESULT_SLOT.R;
                      const reward = item.rewardPoints ?? 0;
                      const isPoint = !item.discordRoleId && reward > 0;
                      const isMiss = !item.discordRoleId && reward === 0;
                      const label = getResultLabel(item);
                      const isVariant = Boolean(item.isVariant);

                      return (
                        <div
                          key={`${item.itemId}-${idx}`}
                          data-result-card
                          data-rarity={item.rarity}
                          className='group flex w-full flex-col items-center gap-2'
                        >
                          <div
                            className={`relative w-full aspect-square rounded-xl border-2 p-2 transition-all ${
                              drawResults.length === 1 ? 'max-w-xs' : ''
                            } ${rarityStyle.frame} ${isVariant ? 'ring-2 ring-amber-300/70 shadow-[0_0_35px_rgba(251,191,36,0.35)]' : rarityStyle.glow} shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_24px_rgba(0,0,0,0.28)]`}
                          >
                            <div className={`pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br ${rarityStyle.shimmer}`} />
                            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 pointer-events-none' />

                            <div className='absolute top-2 left-2 z-10'>
                              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${rarityStyle.text} bg-[color:var(--chip)]`}>
                                <Sparkles className='h-3 w-3' />
                                {item.rarity}
                              </div>
                            </div>

                            {isVariant && (
                              <div className='absolute top-2 right-2 z-10'>
                                <div className='inline-flex items-center rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold text-amber-200'>
                                  변동
                                </div>
                              </div>
                            )}

                            <div className='relative flex h-full w-full items-center justify-center'>
                              {isPoint ? (
                                <div className='flex flex-col items-center gap-1.5'>
                                  <Coins className='h-9 w-9 text-[color:var(--accent-pink)]' />
                                  <span className='text-xs font-bold text-[color:var(--fg)]'>+{reward}P</span>
                                </div>
                              ) : item.roleIconUrl ? (
                                <img
                                  src={item.roleIconUrl}
                                  alt={item.name}
                                  className='h-12 w-12 rounded-lg border border-white/15 object-cover shadow-md'
                                  loading='lazy'
                                  referrerPolicy='no-referrer'
                                />
                              ) : (
                                <span className='text-3xl' aria-label='아이템 아이콘'>📦</span>
                              )}
                            </div>

                            <div
                              className='absolute bottom-1.5 left-1/2 max-w-[82%] -translate-x-1/2 truncate rounded-md border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-2 py-0.5 text-[9px] font-semibold text-[color:var(--fg)] shadow-sm backdrop-blur-sm'
                              title={label}
                            >
                              {label}
                            </div>
                          </div>

                          <div className='text-[9px] font-semibold tracking-wide text-[color:var(--muted)]'>
                            {isVariant
                              ? '변동 업그레이드'
                              : isPoint
                                ? '포인트 보상'
                                : isMiss
                                  ? '다음 기회'
                                  : '역할 획득'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className='mt-5 flex flex-wrap justify-center gap-2.5'>
                    <button
                      onClick={() => setShowResultModal(false)}
                      className='rounded-lg border border-[color:var(--border)] px-4 py-2 text-xs font-medium transition hover:bg-[color:var(--chip)] cursor-pointer'
                    >
                      닫기
                    </button>
                    <button
                      onClick={() => {
                        setShowResultModal(false);
                        void onDraw(drawResults.length);
                      }}
                      className='rounded-lg bg-gradient-to-r from-[#ff5fa2] via-[#ff7f9f] to-[#ffac6d] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-rose-500/25 transition hover:brightness-110 cursor-pointer'
                    >
                      다시 뽑기 ({drawResults.length}회)
                    </button>
                  </div>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>

        {/* Probability Modal */}
        <AnimatePresence>
          {showProbModal && selectedPool && (
            <div className='absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl shadow-2xl'
              >
                <button
                  onClick={() => setShowProbModal(false)}
                  className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                >
                  <X className='w-5 h-5 text-[color:var(--muted)]' />
                </button>

                <div className='p-6 flex flex-col'>
                  <div className='flex items-center justify-center gap-2 mb-4 flex-shrink-0'>
                    <h2 className='text-xl font-bold font-bangul'>확률 정보</h2>
                    {selectedPool.pity_threshold && (
                      <span className='rounded-full bg-[color:var(--chip)] border border-[color:var(--border)] px-2 py-1 text-[10px] sm:text-xs text-[color:var(--muted)]'>
                        <span className='font-semibold text-[color:var(--fg)]'>천장</span>{' '}
                        {(() => {
                          const max = selectedPool.pity_threshold ?? 0;
                          const counter = userStatus?.pityCounter ?? 0;
                          const remaining = Math.max(max - counter, 0);
                          if (selectedPool.pity_rarity) {
                            return `${selectedPool.pity_rarity} 확정 · ${remaining}회 남음`;
                          }
                          return userStatus ? `${counter}/${max}` : `${max}회`;
                        })()}
                      </span>
                    )}
                  </div>

                  <div className='max-h-[45dvh] sm:max-h-[60dvh] overflow-y-auto pr-1 overscroll-contain'>
                    {variantStats && (
                      <div className='mb-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3'>
                        <div className='text-xs font-bold text-[color:var(--fg)] mb-1'>변동</div>
                        <div className='text-[11px] text-[color:var(--muted)] leading-relaxed'>
                          변동은 SSS가 아닌 결과가 <span className='font-semibold text-[color:var(--fg)]'>SSS로 업그레이드</span>되는 추가 판정입니다.
                        </div>
                        <div className='mt-2 grid grid-cols-2 gap-2 text-xs'>
                          <div className='rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/40 px-3 py-2'>
                            <div className='muted text-[10px]'>변동 판정</div>
                            <div className='font-mono font-bold'>
                              {formatPct2(variantStats.variantRollRate * 100)}%
                            </div>
                          </div>
                          <div className='rounded-xl border border-[color:var(--border)] bg-[color:var(--bg)]/40 px-3 py-2'>
                            <div className='muted text-[10px]'>SSS 체감</div>
                            <div className='font-mono font-bold text-amber-300'>
                              {formatPct2(variantStats.effectiveSSSRate * 100)}%
                            </div>
                          </div>
                        </div>
                        <div className='mt-2 text-[10px] muted'>
                          * 변동 표시는 (기본 SSS 제외) 업그레이드가 발생했을 때만 뜹니다: 약 {formatPct2(variantStats.variantMarkRate * 100)}%
                        </div>
                      </div>
                    )}
                    <div className='text-xs font-semibold muted mb-2'>등급별 확률</div>
                    <div className='space-y-2'>
                      {(['SSS', 'SS', 'S', 'R'] as const).map((rarity) => {
                        const rateByRarity = {
                          SSS: selectedPool.rate_sss,
                          SS: selectedPool.rate_ss,
                          S: selectedPool.rate_s,
                          R: selectedPool.rate_r,
                        } as const;

                        return (
                          <div
                            key={rarity}
                            className='rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] p-3'
                          >
                            <button
                              type='button'
                              onClick={() =>
                                setOpenRarities((prev) => {
                                  const nextState: Record<'SSS' | 'SS' | 'S' | 'R', boolean> = {
                                    SSS: false,
                                    SS: false,
                                    S: false,
                                    R: false,
                                  };
                                  nextState[rarity] = !prev[rarity];
                                  return nextState;
                                })
                              }
                              className='w-full flex items-center justify-between text-xs font-bold cursor-pointer'
                            >
                              <span className='flex items-center gap-2'>
                                <span
                                  className={
                                    rarity === 'SSS'
                                      ? 'text-amber-400'
                                      : rarity === 'SS'
                                        ? 'text-purple-400'
                                        : rarity === 'S'
                                          ? 'text-blue-400'
                                          : 'text-gray-400'
                                  }
                                >
                                  {rarity}
                                </span>
                                <span className='muted'>
                                  ({poolItemsLoading ? '-' : itemsByRarity[rarity].length}개)
                                </span>
                              </span>
                              <span className='flex items-center gap-2'>
                                <span className='font-mono'>{rateByRarity[rarity]}%</span>
                                <ChevronDown
                                  className={`w-4 h-4 transition-transform ${openRarities[rarity] ? 'rotate-180' : ''}`}
                                />
                              </span>
                            </button>
                            <AnimatePresence initial={false}>
                              {openRarities[rarity] && (
                                <m.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className='overflow-hidden'
                                >
                                  <div className='mt-3 grid gap-2 grid-cols-3 sm:grid-cols-4'>
                                    {poolItemsLoading ? (
                                      Array.from({ length: 8 }).map((_, i) => (
                                        <Skeleton key={i} className='aspect-square w-full rounded-xl' />
                                      ))
                                    ) : itemsByRarity[rarity].length === 0 ? (
                                      <span className='muted text-xs'>없음</span>
                                    ) : (
                                      itemsByRarity[rarity].map((item) => {
                                        const reward = item.rewardPoints ?? 0;
                                        const isPoint = !item.discordRoleId && reward > 0;
                                        const isMiss = !item.discordRoleId && reward === 0;
                                        const label = isPoint ? `+${reward}P` : isMiss ? '꽝' : item.name;
                                        const slot = RESULT_SLOT[item.rarity] ?? RESULT_SLOT.R;

                                        return (
                                          <div key={item.itemId} className='group flex flex-col items-center gap-1'>
                                            <div
                                              className={`relative w-full aspect-square rounded-xl border p-2 transition-all ${slot.frame}`}
                                            >
                                              <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 pointer-events-none' />

                                              <div className='relative flex h-full w-full items-center justify-center'>
                                                {isPoint ? (
                                                  <div className='flex flex-col items-center gap-1'>
                                                    <Coins className='h-6 w-6 text-[color:var(--accent-pink)]' />
                                                    <span className='text-[9px] font-bold text-[color:var(--fg)]'>
                                                      +{reward}P
                                                    </span>
                                                  </div>
                                                ) : item.roleIconUrl ? (
                                                  <img
                                                    src={item.roleIconUrl}
                                                    alt={item.name}
                                                    className='h-8 w-8 object-cover'
                                                    loading='lazy'
                                                    referrerPolicy='no-referrer'
                                                  />
                                                ) : (
                                                  <span className='text-2xl' aria-label='아이템 아이콘'>📦</span>
                                                )}
                                              </div>

                                              <div
                                                className='absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[9px] font-semibold text-[color:var(--fg)] bg-[color:var(--chip)]/80 backdrop-blur-sm border border-[color:var(--border)] rounded-md truncate max-w-[85%]'
                                                title={label}
                                              >
                                                {label}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </m.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>

                    <p className='mt-4 text-xs text-center text-[color:var(--muted)]'>
                      * 각 등급 내 아이템은 동일한 확률로 등장합니다.
                      <br />* 천장 도달 시 확률과 무관하게 지정된 등급이 등장합니다.
                    </p>
                  </div>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>

        {/* History Modal */}
        <AnimatePresence>
          {showHistoryModal && (
            <div className='absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className='relative max-w-xl w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl shadow-2xl'
              >
                <button
                  onClick={() => {
                    setShowHistoryModal(false);
                    setHistoryFocusPullId(null);
                  }}
                  className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                >
                  <X className='w-5 h-5 text-[color:var(--muted)]' />
                </button>

                <div className='p-6 flex flex-col'>
                  <h2 className='text-xl font-bold mb-4 font-bangul text-center flex-shrink-0'>
                    뽑기 내역
                  </h2>

                  <div className='flex flex-wrap items-center justify-between gap-2 mb-4 flex-shrink-0'>
                    <div className='flex items-center gap-2'>
                      <div className='w-[180px]'>
                        <CustomSelect
                          value={historyPoolId}
                          onChange={setHistoryPoolId}
                          options={[
                            { value: '', label: '모든 풀' },
                            ...pools.map((p) => ({ value: p.pool_id, label: p.name })),
                          ]}
                        />
                      </div>

                      <button
                        type='button'
                        onClick={() => {
                          setHistoryPoolId(selectedPoolId);
                        }}
                        className='rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                        disabled={!selectedPoolId}
                        title='현재 풀로 필터'
                      >
                        현재 풀
                      </button>
                    </div>

                    <div className='flex items-center gap-1.5'>
                      {(['SSS', 'SS', 'S', 'R'] as const).map((rarity) => (
                        <button
                          key={rarity}
                          type='button'
                          onClick={() =>
                            setHistoryRarities((prev) => ({
                              ...prev,
                              [rarity]: !prev[rarity],
                            }))
                          }
                          className={`rounded-full px-3 py-1 text-[11px] font-bold border cursor-pointer transition-colors ${
                            historyRarities[rarity]
                              ? 'border-[color:var(--border)] bg-[color:var(--fg)]/10 text-[color:var(--fg)]'
                              : 'border-[color:var(--border)] bg-transparent text-[color:var(--muted)]'
                          }`}
                        >
                          {rarity}
                        </button>
                      ))}
                    </div>

                    <div className='w-full'>
                      <div className='relative'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted)]' />
                        <input
                          className='w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] pl-9 pr-9 py-2 text-sm text-[color:var(--fg)]'
                          placeholder='아이템 검색…'
                          value={historyQueryInput}
                          onChange={(e) => setHistoryQueryInput(e.target.value)}
                        />
                        {historyQueryInput && (
                          <button
                            type='button'
                            className='absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                            title='검색 지우기'
                            onClick={() => setHistoryQueryInput('')}
                          >
                            <X className='h-4 w-4 text-[color:var(--muted)]' />
                          </button>
                        )}
                      </div>
                      <div className='mt-1 text-[10px] muted'>
                        * 현재 불러온 내역 기준으로 CSV를 다운로드합니다.
                      </div>
                    </div>
                  </div>

                  <div className='max-h-[35dvh] sm:max-h-[50dvh] overflow-y-auto space-y-2 pr-1 overscroll-contain'>
                  {historyEntries.length === 0 && historyLoading ? (
                    <div className='space-y-2'>
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className='h-14 w-full' />
                      ))}
                    </div>
                  ) : historyEntries.length === 0 ? (
                    <div className='text-sm muted text-center py-10'>
                      내역이 없습니다.
                    </div>
                  ) : (
                    historyGroups.map((group) => {
                      if (group.isTenPull) {
                        const newest = new Date(group.entries[0].createdAt);
                        const oldest = new Date(group.entries[group.entries.length - 1].createdAt);
                        const poolName = group.entries[0].pool.name ?? '알 수 없는 풀';
                        const totalSpent = group.entries.reduce((sum, e) => sum + (e.spentPoints ?? 0), 0);
                        const pityCount = group.entries.reduce(
                          (sum, e) => sum + (e.result?.isPity ? 1 : 0),
                          0,
                        );
                        const counts = group.entries.reduce(
                          (acc, e) => {
                            const r = (e.result?.rarity ?? 'R') as 'SSS' | 'SS' | 'S' | 'R';
                            acc[r] += 1;
                            return acc;
                          },
                          { SSS: 0, SS: 0, S: 0, R: 0 } as Record<'SSS' | 'SS' | 'S' | 'R', number>,
                        );

                        const isOpen = Boolean(openHistoryGroups[group.key]);

                        return (
                          <div
                            key={group.key}
                            className='rounded-2xl border border-[color:var(--border)] p-3 bg-[color:var(--chip)]/50'
                          >
                            <div className='flex items-start justify-between gap-3'>
                              <button
                                type='button'
                                className='min-w-0 flex-1 text-left cursor-pointer'
                                onClick={() =>
                                  setOpenHistoryGroups((prev) => ({
                                    ...prev,
                                    [group.key]: !prev[group.key],
                                  }))
                                }
                              >
                                <div className='flex items-center gap-2 flex-wrap'>
                                  <span className='px-2 py-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg)]/40 text-[10px] font-bold text-[color:var(--fg)]'>
                                    10연
                                  </span>
                                  <div className='text-sm font-bold text-[color:var(--fg)] break-keep'>
                                    {poolName}
                                  </div>
                                  {pityCount > 0 && (
                                    <span className='px-2 py-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-[10px] font-bold text-[color:var(--accent-pink)]'>
                                      천장 {pityCount}
                                    </span>
                                  )}
                                </div>
                                <div className='mt-1 text-[11px] muted'>
                                  {newest.toLocaleString()}
                                  <span className='mx-1'>•</span>
                                  {oldest.toLocaleTimeString()}
                                  <span className='mx-1'>•</span>
                                  {totalSpent > 0 ? `${totalSpent}P` : '무료 포함'}
                                  <span className='mx-1'>•</span>
                                  SSS {counts.SSS} / SS {counts.SS} / S {counts.S} / R {counts.R}
                                </div>
                              </button>

                              <div className='flex items-center gap-2'>
                                <button
                                  type='button'
                                  className='flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer'
                                  title='공유 링크 복사'
                                  onClick={async () => {
                                    try {
                                  const url = new URL('/draw', window.location.origin);
                                  url.searchParams.set('history', '1');
                                  url.searchParams.set('focusPull', group.key);
                                  await navigator.clipboard.writeText(url.toString());
                                  toast.success('링크를 복사했습니다.');
                                } catch {
                                  toast.error('링크 복사에 실패했습니다.');
                                }
                              }}
                                >
                                  <Copy className='h-4 w-4' />
                                </button>
                                <button
                                  type='button'
                                  className='flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer'
                                  title={isOpen ? '접기' : '펼치기'}
                                  onClick={() =>
                                    setOpenHistoryGroups((prev) => ({
                                      ...prev,
                                      [group.key]: !prev[group.key],
                                    }))
                                  }
                                >
                                  <ChevronDown
                                    className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              </div>
                            </div>

                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <m.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className='overflow-hidden'
                                >
                                  <div className='mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2'>
                                    {group.entries.map((entry) => {
                                      const rarity = (entry.result?.rarity ?? 'R') as 'SSS' | 'SS' | 'S' | 'R';
                                      const isFocus = historyFocusPullId === entry.pullId;
                                      const rarityClass =
                                        rarity === 'SSS'
                                          ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                          : rarity === 'SS'
                                            ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                                            : rarity === 'S'
                                              ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                                              : 'text-gray-400 border-gray-500/30 bg-gray-500/10';

                                      return (
                                        <div
                                          key={entry.pullId}
                                          id={`pull-${entry.pullId}`}
                                          className={`rounded-xl border p-2 bg-[color:var(--bg)]/40 ${
                                            isFocus
                                              ? 'border-[color:var(--accent-pink)] shadow-[0_0_0_1px_rgba(255,95,162,0.35)]'
                                              : 'border-[color:var(--border)]'
                                          }`}
                                        >
                                          <div className='flex items-center justify-between gap-2'>
                                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${rarityClass}`}>
                                              {rarity}
                                            </span>
                                            <button
                                              type='button'
                                              className='flex h-6 w-6 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                                              title='공유 링크 복사'
                                              onClick={async () => {
                                                try {
                                                  const url = new URL('/draw', window.location.origin);
                                                  url.searchParams.set('history', '1');
                                                  url.searchParams.set('focusPull', entry.pullId);
                                                  await navigator.clipboard.writeText(url.toString());
                                                  toast.success('링크를 복사했습니다.');
                                                } catch {
                                                  toast.error('링크 복사에 실패했습니다.');
                                                }
                                              }}
                                            >
                                              <Copy className='h-3 w-3 text-[color:var(--muted)]' />
                                            </button>
                                          </div>
                                          <div className='mt-1 text-xs font-semibold text-[color:var(--fg)] truncate'>
                                            {entry.result?.name ?? '알 수 없음'}
                                          </div>
                                          <div className='mt-1 flex items-center gap-1 flex-wrap'>
                                            {entry.result?.isPity && (
                                              <span className='px-1.5 py-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-[10px] font-bold text-[color:var(--accent-pink)]'>
                                                천장
                                              </span>
                                            )}
                                            {entry.result?.isVariant && (
                                              <span className='px-1.5 py-0.5 rounded-full border border-amber-300/40 bg-amber-300/15 text-[10px] font-bold text-amber-200'>
                                                변동
                                              </span>
                                            )}
                                            {entry.isFree && (
                                              <span className='px-1.5 py-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg)]/40 text-[10px] font-bold text-[color:var(--muted)]'>
                                                무료
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </m.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      }

                      const entry = group.entries[0];
                      const rarity = entry.result?.rarity ?? 'R';
                      const isFocus = historyFocusPullId === entry.pullId;
                      const rarityClass =
                        rarity === 'SSS'
                          ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                          : rarity === 'SS'
                            ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                            : rarity === 'S'
                              ? 'text-blue-400 border-blue-500/30 bg-blue-500/10'
                              : 'text-gray-400 border-gray-500/30 bg-gray-500/10';
                      const created = new Date(entry.createdAt);

                      return (
                        <div
                          key={entry.pullId}
                          id={`pull-${entry.pullId}`}
                          className={`rounded-2xl border p-3 bg-[color:var(--chip)]/50 ${
                            isFocus
                              ? 'border-[color:var(--accent-pink)] shadow-[0_0_0_1px_rgba(255,95,162,0.35)]'
                              : 'border-[color:var(--border)]'
                          }`}
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='min-w-0'>
                                <div className='flex items-center gap-2 flex-wrap'>
                                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${rarityClass}`}>
                                    {rarity}
                                  </span>
                                  <div className='text-sm font-bold text-[color:var(--fg)] break-keep'>
                                    {entry.result?.name ?? '알 수 없음'}
                                    {!entry.result?.discordRoleId &&
                                      entry.result?.rewardPoints &&
                                      entry.result.rewardPoints > 0 &&
                                      ` (+${entry.result.rewardPoints}p)`}
                                    {!entry.result?.discordRoleId &&
                                      entry.result?.rewardPoints === 0 &&
                                      ' (꽝)'}
                                  </div>
                                  {entry.result?.isPity && (
                                    <span className='px-2 py-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-[10px] font-bold text-[color:var(--accent-pink)]'>
                                      천장
                                    </span>
                                  )}
                                  {entry.result?.isVariant && (
                                    <span className='px-2 py-0.5 rounded-full border border-amber-300/40 bg-amber-300/15 text-[10px] font-bold text-amber-200'>
                                      변동
                                    </span>
                                  )}
                                  {entry.isFree && (
                                    <span className='px-2 py-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--bg)]/40 text-[10px] font-bold text-[color:var(--muted)]'>
                                      무료
                                    </span>
                                  )}
                                </div>
                              <div className='mt-1 text-[11px] muted'>
                                {entry.pool.name ?? '알 수 없는 풀'}
                                <span className='mx-1'>•</span>
                                {created.toLocaleString()}
                                {!entry.isFree && entry.spentPoints > 0 && (
                                  <>
                                    <span className='mx-1'>•</span>
                                    {entry.spentPoints}P
                                  </>
                                )}
                              </div>
                            </div>

                            <button
                              type='button'
                              className='flex h-9 w-9 items-center justify-center rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer'
                              title='공유 링크 복사'
                              onClick={async () => {
                                try {
                                  const url = new URL('/draw', window.location.origin);
                                  url.searchParams.set('history', '1');
                                  url.searchParams.set('focusPull', entry.pullId);
                                  await navigator.clipboard.writeText(url.toString());
                                  toast.success('링크를 복사했습니다.');
                                } catch {
                                  toast.error('링크 복사에 실패했습니다.');
                                }
                              }}
                            >
                              <Copy className='h-4 w-4' />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  </div>

                  <div className='mt-4 flex items-center justify-between gap-3 flex-shrink-0'>
                    <div className='flex items-center gap-2'>
                      <button
                        type='button'
                        onClick={() => void fetchHistory({ reset: true })}
                        className='rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-xs font-semibold text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer'
                        disabled={historyLoading}
                      >
                        새로고침
                      </button>
                      <button
                        type='button'
                        onClick={downloadHistoryCsv}
                        className='flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-xs font-semibold text-[color:var(--fg)] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                        disabled={historyLoading || historyEntries.length === 0}
                        title='CSV 다운로드'
                      >
                        <Download className='h-4 w-4' />
                        CSV
                      </button>
                    </div>
                    <button
                      type='button'
                      onClick={() => void fetchHistory()}
                      className='rounded-xl bg-[color:var(--accent-pink)] text-white px-4 py-2 text-xs font-bold hover:brightness-110 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
                      disabled={historyLoading || !historyHasMore}
                    >
                      {historyLoading ? '불러오는 중…' : historyHasMore ? '더 불러오기' : '끝'}
                    </button>
                  </div>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>

        {/* Insufficient Points Modal */}
        <AnimatePresence>
          {showInsufficientModal && (
            <div className='absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
              <m.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-[32px] p-8 shadow-2xl text-center'
              >
                <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-pink-500/10 border border-pink-500/20 text-[color:var(--accent-pink)] shadow-[0_0_40px_rgba(255,95,162,0.15)]'>
                  <AlertCircle className='h-10 w-10' strokeWidth={1.5} />
                </div>

                <h2 className='text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2'>
                  포인트가 부족해!
                </h2>
                <p className='text-sm muted leading-relaxed mb-8'>
                  뽑기를 하려면 포인트가 더 필요해.
                  <br />
                  채팅 활동을 통해 포인트를 모아봐!
                </p>

                <div className='flex flex-col gap-3'>
                  <m.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowInsufficientModal(false)}
                    className='w-full rounded-2xl btn-bangul px-5 py-4 text-sm font-bold shadow-lg'
                  >
                    확인
                  </m.button>
                  <m.button
                    whileHover={{ opacity: 0.8 }}
                    onClick={() => setShowInsufficientModal(false)}
                    className='w-full text-xs font-semibold muted transition-opacity'
                  >
                    나중에 할래
                  </m.button>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPoolListMobile && (
            <div className='absolute inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm md:hidden'>
              <m.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className='w-full bg-[color:var(--card)] border-t border-[color:var(--border)] rounded-t-[32px] p-6 max-h-[80vh] overflow-y-auto'
              >
                <div className='flex items-center justify-between mb-6'>
                  <div>
                    <h2 className='text-xl font-bold font-bangul'>
                      뽑기 풀 선택
                    </h2>
                    <p className='text-xs muted mt-1'>
                      원하는 테마를 골라보세요.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPoolListMobile(false)}
                    className='p-2 rounded-full bg-[color:var(--chip)] text-[color:var(--muted)]'
                  >
                    <X className='w-5 h-5' />
                  </button>
                </div>

                <div className='grid gap-3 sm:grid-cols-2'>
                  {pools.map((p) => (
                    <button
                      key={p.pool_id}
                      type='button'
                      className={`relative flex items-center gap-4 w-full text-left rounded-2xl border p-3 transition-all cursor-pointer overflow-hidden ${
                        selectedPoolId === p.pool_id
                          ? 'border-[color:var(--accent-pink)] bg-[color:var(--accent-pink)]/5'
                          : 'border-[color:var(--border)] bg-[color:var(--chip)]/50 hover:bg-[color:var(--chip)]'
                      }`}
                      onClick={() => {
                        setSelectedPoolId(p.pool_id);
                        setShowPoolListMobile(false);
                      }}
                    >
                      <div className='h-12 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-[color:var(--border)] bg-black/5 relative'>
                        <Image
                          src={p.banner_image_url ?? '/banner.png'}
                          alt={p.name}
                          fill
                          className='object-cover'
                        />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='text-sm font-bold truncate'>
                          {p.name}
                        </div>
                        <div className='text-[10px] muted flex items-center gap-1.5 mt-0.5'>
                          <span
                            className={
                              p.kind === 'limited'
                                ? 'text-[color:var(--accent-pink)] font-bold'
                                : ''
                            }
                          >
                            {p.kind === 'permanent' ? '상시' : '한정'}
                          </span>
                          {p.kind === 'limited' && p.end_at && (
                            (() => {
                              const dDay = formatDDay(p.end_at);
                              if (!dDay) return null;
                              return (
                                <span className='inline-flex items-center rounded-full border border-[color:var(--accent-pink)]/30 bg-[color:var(--accent-pink)]/10 px-2 py-0.5 text-[9px] font-bold text-[color:var(--accent-pink)] font-mono'>
                                  {dDay}
                                </span>
                              );
                            })()
                          )}
                          <span>•</span>
                          <span>{p.cost_points}P</span>
                        </div>
                      </div>
                      {selectedPoolId === p.pool_id && (
                        <div className='absolute top-2 right-2'>
                          <div className='h-2 w-2 rounded-full bg-[color:var(--accent-pink)] shadow-[0_0_8px_var(--accent-pink)]' />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
