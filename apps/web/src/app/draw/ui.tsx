'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/toast/ToastProvider';
import { GachaScene } from './GachaScene';
import { AnimatePresence, m } from 'framer-motion';
import { X, Info, Coins, AlertCircle, ChevronDown } from 'lucide-react';
import Image from 'next/image';
import { Skeleton } from '@/components/ui/Skeleton';

type DrawResult = {
  itemId: string;
  name: string;
  rarity: string;
  discordRoleId: string | null;
  rewardPoints?: number;
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
  rate_r: number;
  rate_s: number;
  rate_ss: number;
  rate_sss: number;
};

const PityGauge = ({ current, max }: { current: number; max: number }) => (
  <div className='mt-2 w-full max-w-[200px] mx-auto backdrop-blur-sm bg-[color:var(--card)]/50 p-2 rounded-xl border border-[color:var(--border)] shadow-sm'>
    <div className='flex justify-between text-[10px] text-[color:var(--muted)] mb-1 px-1 font-semibold'>
      <span>천장</span>
      <span>
        {current} / {max}
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

export default function DrawClient() {
  const toast = useToast();
  const [pools, setPools] = useState<Pool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');

  // User Status
  const [userStatus, setUserStatus] = useState<{
    balance: number;
    pityCounter: number;
  } | null>(null);
  const [showProbModal, setShowProbModal] = useState(false);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [showPoolListMobile, setShowPoolListMobile] = useState(false);

  // Animation & Result State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawResults, setDrawResults] = useState<DrawResult[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [busy, setBusy] = useState(false);

  // Computed
  const highestRarityItem = useMemo(() => {
    if (drawResults.length === 0) return null;
    const order: Record<string, number> = { SSS: 4, SS: 3, S: 2, R: 1 };
    return drawResults.reduce((prev, curr) =>
      (order[curr.rarity] || 0) > (order[prev.rarity] || 0) ? curr : prev,
    );
  }, [drawResults]);

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
        setSelectedPoolId((prev) => prev || loaded[0]?.pool_id || '');
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

  const fetchStatus = useCallback(async () => {
    try {
      const url = selectedPoolId
        ? `/api/gacha/status?poolId=${selectedPoolId}`
        : '/api/gacha/status';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setUserStatus(data);
      }
    } catch (e) {
      console.error('[DrawClient] fetchStatus failed:', e);
    }
  }, [selectedPoolId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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
        };
        if (data.results) {
          setDrawResults(data.results);
        } else if (data.itemId) {
          setDrawResults([data as unknown as DrawResult]);
        } else {
          throw new Error('Invalid response format');
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

  // Rarity Colors for Result Modal
  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'R':
        return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
      case 'S':
        return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      case 'SS':
        return 'text-purple-400 border-purple-500/30 bg-purple-500/10';
      case 'SSS':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-[0_0_30px_-5px_rgba(251,191,36,0.3)]';
      default:
        return 'text-gray-400 border-gray-500/30 bg-gray-500/10';
    }
  };

  return (
    <main className='flex h-[calc(100vh-64px)] overflow-hidden'>
      {/* Left Sidebar - Pool List */}
      <aside className='w-80 border-r border-[color:var(--border)] bg-[color:var(--card)] p-4 overflow-y-auto flex-shrink-0 z-10 hidden md:block'>
        <div className='text-[11px] tracking-[0.28em] muted-2 mb-6'>
          BANGULNYANG
        </div>
        <h1 className='text-2xl font-bold tracking-tight mb-1 font-bangul'>
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
            rarity={highestRarityItem?.rarity}
            onAnimationComplete={onAnimationComplete}
          />
        </div>

        {/* Overlay UI */}
        <div
          className={`absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8 transition-opacity duration-500 ${isDrawing ? 'opacity-0' : 'opacity-100'}`}
        >
          {/* Top Left Info (Mobile) / Top Right (Desktop) */}
          <div className='absolute top-4 left-4 pointer-events-auto flex md:hidden items-center gap-2'>
            <button
              onClick={() => setShowProbModal(true)}
              className='flex h-9 w-9 items-center justify-center rounded-xl bg-[color:var(--card)]/80 backdrop-blur-md border border-[color:var(--border)] text-[color:var(--muted)] shadow-sm cursor-pointer'
              title='확률 정보'
            >
              <Info className='w-5 h-5' />
            </button>
          </div>

          {/* Top Right Balance */}
          <div className='absolute top-4 right-4 pointer-events-auto flex items-center gap-2 bg-[color:var(--card)]/80 backdrop-blur-md px-3 py-2 rounded-xl border border-[color:var(--border)] shadow-sm'>
            <Coins className='w-3.5 h-3.5 text-[color:var(--accent-pink)] sm:hidden' />
            <span className='text-[10px] sm:text-xs text-[color:var(--muted)] mr-1 sm:mr-2'>
              보유 포인트
            </span>
            <span className='text-xs sm:text-sm font-bold text-[color:var(--accent-pink)]'>
              {userStatus ? (
                `${userStatus.balance.toLocaleString()} P`
              ) : (
                <Skeleton className='h-4 w-12 sm:w-16 inline-block align-middle' />
              )}
            </span>
          </div>

          {/* Header */}
          <div className='flex flex-col items-center pt-16 sm:pt-4 w-full'>
            {selectedPool && (
              <>
                <m.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className='group flex items-center gap-2 bg-[color:var(--accent-pink)]/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-[color:var(--accent-pink)]/30 shadow-lg mb-2 pointer-events-auto cursor-pointer md:bg-[color:var(--card)]/80 md:border-[color:var(--border)] md:cursor-default'
                  onClick={() => setShowPoolListMobile(true)}
                >
                  <span className='text-[10px] font-bold text-[color:var(--accent-pink)] md:hidden'>
                    테마
                  </span>
                  <span className='text-xs sm:text-sm font-bold truncate max-w-[120px] sm:max-w-none'>
                    {selectedPool.name}
                  </span>
                  <ChevronDown className='w-3.5 h-3.5 text-[color:var(--accent-pink)] md:hidden' />
                </m.button>
                {selectedPool.pity_threshold && userStatus && (
                  <PityGauge
                    current={userStatus.pityCounter}
                    max={selectedPool.pity_threshold}
                  />
                )}
              </>
            )}
          </div>

          {/* Footer / Controls */}
          <div className='flex justify-center pb-8 gap-3 pointer-events-auto'>
            <button
              type='button'
              onClick={() => void onDraw(1)}
              disabled={busy || !selectedPoolId || isDrawing}
              className={`
                group relative px-5 py-3.5 bg-[color:var(--card)] hover:bg-[color:var(--chip)]
                border border-[color:var(--border)]
                rounded-2xl font-bold text-[color:var(--fg)] shadow-lg
                transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed
                cursor-pointer overflow-hidden min-w-[110px] sm:px-8 sm:py-4 sm:min-w-[140px]
              `}
            >
              <span className='relative z-10 flex flex-col items-center'>
                <span className='text-xs sm:text-sm font-bold'>1회</span>
                <span className='text-[10px] sm:text-xs muted mt-0.5 sm:mt-1'>
                  {selectedPool?.cost_points ?? 0}P
                </span>
              </span>
            </button>

            <button
              type='button'
              onClick={() => void onDraw(10)}
              disabled={busy || !selectedPoolId || isDrawing}
              className={`
                group relative px-5 py-3.5 bg-gradient-to-r from-[#ff5fa2] to-[#ff8bc2] 
                rounded-2xl font-bold text-white shadow-lg shadow-pink-500/20 
                transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed
                cursor-pointer overflow-hidden min-w-[110px] sm:px-8 sm:py-4 sm:min-w-[140px]
              `}
            >
              <span className='relative z-10 flex flex-col items-center'>
                {busy || isDrawing ? (
                  <span className='text-xs sm:text-sm'>진행 중…</span>
                ) : (
                  <>
                    <span className='text-xs sm:text-sm font-bold'>10회</span>
                    <span className='text-[10px] sm:text-xs text-white/80 mt-0.5 sm:mt-1'>
                      {(selectedPool?.cost_points ?? 0) * 10}P
                    </span>
                  </>
                )}
              </span>
              <div className='absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300' />
            </button>
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
          </div>
        </div>

        {/* Result Modal Overlay */}
        <AnimatePresence>
          {showResultModal && drawResults.length > 0 && (
            <div className='absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
              <m.div
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className='relative max-w-4xl w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto'
              >
                <button
                  onClick={() => setShowResultModal(false)}
                  className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                >
                  <X className='w-5 h-5 text-[color:var(--muted)]' />
                </button>

                <div className='text-center pt-2 pb-6'>
                  <h2 className='text-2xl font-bold mb-6 font-bangul'>
                    뽑기 결과
                  </h2>

                  <div
                    className={`grid gap-4 ${drawResults.length === 1 ? 'place-items-center' : 'grid-cols-2 md:grid-cols-5'}`}
                  >
                    {drawResults.map((item, idx) => (
                      <div
                        key={`${item.itemId}-${idx}`}
                        className={`
                          relative group flex flex-col items-center p-4 rounded-xl border transition-all duration-500
                          ${drawResults.length === 1 ? 'w-full max-w-xs aspect-square justify-center text-lg' : 'w-full'}
                          ${getRarityColor(item.rarity)}
                        `}
                      >
                        <div
                          className={`font-bold rounded-full px-2 py-0.5 text-xs mb-2 border bg-white/20`}
                        >
                          {item.rarity}
                        </div>
                        <div className='font-bold text-center break-keep'>
                          {item.name}
                        </div>
                        {!item.discordRoleId && (
                          <div className='mt-2 text-xs font-semibold text-[color:var(--muted)]'>
                            {item.rewardPoints && item.rewardPoints > 0
                              ? `포인트 +${item.rewardPoints}p`
                              : '꽝'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className='mt-8 flex gap-3 justify-center'>
                    <button
                      onClick={() => setShowResultModal(false)}
                      className='px-6 py-3 rounded-xl border border-[color:var(--border)] hover:bg-[color:var(--chip)] transition text-sm font-medium cursor-pointer'
                    >
                      닫기
                    </button>
                    <button
                      onClick={() => {
                        setShowResultModal(false);
                        void onDraw(drawResults.length);
                      }}
                      className='px-6 py-3 rounded-xl bg-[color:var(--accent-pink)] text-white hover:brightness-110 transition text-sm font-bold cursor-pointer'
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
                className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-3xl p-6 shadow-2xl'
              >
                <button
                  onClick={() => setShowProbModal(false)}
                  className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                >
                  <X className='w-5 h-5 text-[color:var(--muted)]' />
                </button>

                <h2 className='text-xl font-bold mb-4 font-bangul text-center'>
                  확률 정보
                </h2>

                <div className='space-y-2'>
                  <div className='flex justify-between items-center p-3 rounded-xl bg-[color:var(--chip)] border border-[color:var(--border)]'>
                    <span className='font-bold text-[color:var(--accent-pink)]'>
                      SSS
                    </span>
                    <span className='font-mono'>{selectedPool.rate_sss}%</span>
                  </div>
                  <div className='flex justify-between items-center p-3 rounded-xl bg-[color:var(--chip)] border border-[color:var(--border)]'>
                    <span className='font-bold text-purple-400'>SS</span>
                    <span className='font-mono'>{selectedPool.rate_ss}%</span>
                  </div>
                  <div className='flex justify-between items-center p-3 rounded-xl bg-[color:var(--chip)] border border-[color:var(--border)]'>
                    <span className='font-bold text-blue-400'>S</span>
                    <span className='font-mono'>{selectedPool.rate_s}%</span>
                  </div>
                  <div className='flex justify-between items-center p-3 rounded-xl bg-[color:var(--chip)] border border-[color:var(--border)]'>
                    <span className='font-bold text-gray-400'>R</span>
                    <span className='font-mono'>{selectedPool.rate_r}%</span>
                  </div>
                </div>

                <p className='mt-4 text-xs text-center text-[color:var(--muted)]'>
                  * 각 등급 내 아이템은 동일한 확률로 등장합니다.
                  <br />* 천장 도달 시 확률과 무관하게 지정된 등급이 등장합니다.
                </p>
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
