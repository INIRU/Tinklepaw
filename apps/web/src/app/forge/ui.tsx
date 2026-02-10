'use client';

import gsap from 'gsap';
import { Coins, Hammer, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import ForgeScene from './ForgeScene';

type ForgePhase = 'idle' | 'charging' | 'success' | 'downgrade' | 'destroy' | 'error';

type ForgeStatus = {
  level: number;
  enhanceCost: number;
  sellPrice: number;
  successRatePct: number;
  balance: number;
  tunaEnergy: number;
  enhanceAttempts: number;
  successCount: number;
  soldCount: number;
};

type EnhanceResponse = {
  result: 'success' | 'downgrade' | 'destroy';
  previousLevel: number;
  level: number;
  cost: number;
  successRatePct: number;
  sellPrice: number;
  balance: number;
  tunaEnergy: number;
  enhanceAttempts: number;
  successCount: number;
};

type SellResponse = {
  soldLevel: number;
  payout: number;
  balance: number;
  level: number;
  nextEnhanceCost: number;
  sellCount: number;
};

const clampPct = (value: number) => Math.max(0, Math.min(100, value));
const pct = (value: number) => `${value.toFixed(1)}%`;
const ENHANCE_MIN_CHARGE_MS = 1800;
const ENHANCE_RESULT_HOLD_MS = 2400;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const computeEnhanceCost = (level: number) => {
  const normalizedLevel = Math.max(0, Math.floor(level));
  const baseCost = 300 + normalizedLevel * 140 + normalizedLevel * normalizedLevel * 12;
  if (normalizedLevel < 7) return baseCost;

  const extraLevel = normalizedLevel - 6;
  return baseCost + extraLevel * 180 + extraLevel * extraLevel * 26;
};

export default function ForgeClient() {
  const [status, setStatus] = useState<ForgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<ForgePhase>('idle');
  const [lastMessage, setLastMessage] = useState('강화하기를 눌러 참치캔을 달궈봐. 기운 3개면 50% 할인!');
  const uiRef = useRef<HTMLDivElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  const probabilities = useMemo(() => {
    const success = clampPct(status?.successRatePct ?? 0);
    const level = status?.level ?? 0;
    const destroyOnFail = level >= 12 ? Math.min(45, 18 + (level - 12) * 3) : 0;
    const destroy = ((100 - success) * destroyOnFail) / 100;
    const downgrade = Math.max(0, 100 - success - destroy);

    return {
      success,
      downgrade,
      destroy,
    };
  }, [status?.level, status?.successRatePct]);

  const discountReady = (status?.tunaEnergy ?? 0) >= 3;
  const effectiveEnhanceCost = status ? (discountReady ? Math.floor(status.enhanceCost * 0.5) : status.enhanceCost) : 0;
  const canSell = Boolean(status && status.level > 0 && status.sellPrice > 0);
  const sellBlockedByZeroPrice = Boolean(status && status.level > 0 && status.sellPrice <= 0);

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const queueIdle = (delay = 1300) => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      setPhase('idle');
    }, delay);
  };

  const loadStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch('/api/forge/status', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error ?? '강화 상태를 불러오지 못했습니다.');
      }
      setStatus(body as ForgeStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : '강화 상태를 불러오지 못했습니다.';
      setLastMessage(message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    return () => {
      clearResetTimer();
    };
  }, []);

  useEffect(() => {
    if (!uiRef.current) return;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(uiRef.current, { opacity: 0, y: 18, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.4 });
    return () => {
      tl.kill();
    };
  }, []);

  const handleEnhance = async () => {
    if (!status || busy) return;

    const previousEnhanceCost = status.enhanceCost;
    clearResetTimer();
    setBusy(true);
    setPhase('charging');
    setLastMessage('파티클을 모으는 중... 참치캔이 빛나고 있어.');
    let idleDelay = ENHANCE_RESULT_HOLD_MS;

    try {
      const chargeStartedAt = performance.now();
      const response = await fetch('/api/forge/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const elapsed = performance.now() - chargeStartedAt;
      if (elapsed < ENHANCE_MIN_CHARGE_MS) {
        await sleep(ENHANCE_MIN_CHARGE_MS - elapsed);
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const code = typeof body?.code === 'string' ? body.code : null;
        setPhase('error');

        if (code === 'INSUFFICIENT_POINTS') {
          const requiredCost = typeof body?.cost === 'number' ? body.cost : null;
          setLastMessage(
            requiredCost !== null
              ? `포인트가 부족해. ${requiredCost.toLocaleString('ko-KR')}p 필요해.`
              : '포인트가 부족해서 강화에 실패했어.'
          );
        } else {
          setLastMessage('강화 중 오류가 발생했어.');
        }

        await loadStatus(true);
        return;
      }

      const result = body as EnhanceResponse;
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              level: result.level,
              enhanceCost: computeEnhanceCost(result.level),
              sellPrice: result.sellPrice,
              successRatePct: result.successRatePct,
              balance: result.balance,
              tunaEnergy: result.tunaEnergy,
              enhanceAttempts: result.enhanceAttempts,
              successCount: result.successCount,
            }
          : prev
      );

      const usedEnergyDiscount = result.cost < previousEnhanceCost;
      const costPrefix = usedEnergyDiscount ? '기운 할인! ' : '';
      const paidCostText = `${result.cost.toLocaleString('ko-KR')}p 소모`;

      if (result.result === 'success') {
        setPhase('success');
        setLastMessage(`${costPrefix}성공! 참치캔 강화가 한 단계 올랐어. (${paidCostText})`);
      } else if (result.result === 'downgrade') {
        setPhase('downgrade');
        setLastMessage(`${costPrefix}하락! +${result.previousLevel} → +${result.level} (${paidCostText})`);
      } else {
        setPhase('destroy');
        setLastMessage(`${costPrefix}대실패! 캔이 터져서 +0으로 초기화됐어. (${paidCostText})`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '강화 중 오류가 발생했습니다.';
      setPhase('error');
      setLastMessage(message);
      await loadStatus(true);
      idleDelay = 1600;
    } finally {
      setBusy(false);
      queueIdle(idleDelay);
    }
  };

  const handleSell = async () => {
    if (!status || busy || status.level <= 0) return;
    if (status.sellPrice <= 0) {
      setLastMessage('판매 예상 금액이 0p라 판매할 수 없어.');
      return;
    }

    clearResetTimer();
    setBusy(true);
    setLastMessage('참치캔을 정리해서 판매 중...');

    try {
      const response = await fetch('/api/forge/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setLastMessage(body?.error ?? '판매에 실패했습니다.');
        await loadStatus(true);
        return;
      }

      const result = body as SellResponse;
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              level: result.level,
              enhanceCost: result.nextEnhanceCost,
              sellPrice: 0,
              successRatePct: 94,
              balance: result.balance,
              soldCount: result.sellCount,
            }
          : prev
      );

      setLastMessage(`판매 완료! +${result.payout.toLocaleString('ko-KR')}p 획득`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '판매 중 오류가 발생했습니다.';
      setLastMessage(message);
      await loadStatus(true);
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  return (
    <main className="relative h-[calc(100dvh-82px)] max-h-[calc(100dvh-82px)] overflow-hidden">
      <div className="absolute inset-0">
        <ForgeScene phase={phase} level={status?.level ?? 0} />
      </div>

      <section ref={uiRef} className="pointer-events-none relative z-10 mx-auto h-full w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex h-full flex-col justify-between">
          <div className="pointer-events-auto card-glass inline-flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[color:var(--fg)]">
            <span className="rounded-lg border border-[color:color-mix(in_srgb,var(--fg)_22%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_74%,transparent)] px-2 py-1 font-black text-[color:var(--fg)]">
              +{status?.level ?? 0}
            </span>
            <span>참치캔 강화소</span>
            <span className="ml-1 inline-flex items-center gap-1 rounded-lg border border-[color:color-mix(in_srgb,var(--fg)_16%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_78%,transparent)] px-2 py-1 text-[11px] text-[color:var(--muted)]">
              <Coins className="h-3.5 w-3.5" />
              {status?.balance?.toLocaleString('ko-KR') ?? 0}p
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-[color:color-mix(in_srgb,var(--fg)_16%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_78%,transparent)] px-2 py-1 text-[11px] text-[color:var(--muted)]">
              <Sparkles className="h-3.5 w-3.5" />
              기운 {status?.tunaEnergy?.toLocaleString('ko-KR') ?? 0}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                discountReady
                  ? 'border-[color:color-mix(in_srgb,#facc15_38%,var(--border))] bg-[color:color-mix(in_srgb,#facc15_14%,var(--card))] text-[#facc15]'
                  : 'border-[color:color-mix(in_srgb,var(--fg)_16%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_78%,transparent)] text-[color:var(--muted)]'
              }`}
            >
              {discountReady ? '50% 할인 준비' : '기운 3개 필요'}
            </span>
          </div>

          <div className="pointer-events-none mb-2 flex flex-col items-center gap-3">
            <div className="pointer-events-auto card-glass rounded-xl px-3 py-2 text-[11px] text-[color:var(--fg)] sm:text-xs">
              <div className="grid grid-cols-3 gap-3 sm:gap-5">
                <div className="text-center">
                  <p className="text-[10px] text-[color:var(--muted)] sm:text-[11px]">성공 확률</p>
                  <p className="font-black text-[#facc15]">{loading ? '-' : pct(probabilities.success)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-[color:var(--muted)] sm:text-[11px]">실패(하락) 확률</p>
                  <p className="font-black text-[#f87171]">{loading ? '-' : pct(probabilities.downgrade)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-[color:var(--muted)] sm:text-[11px]">파괴 확률</p>
                  <p className="font-black text-[#9ca3af]">{loading ? '-' : pct(probabilities.destroy)}</p>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[color:color-mix(in_srgb,var(--fg)_10%,transparent)] pt-2 sm:gap-3">
                <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--fg)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_78%,transparent)] px-2 py-1.5 text-center">
                  <p className="text-[10px] text-[color:var(--muted)]">강화 비용</p>
                  <p className="font-black text-[color:var(--fg)]">{effectiveEnhanceCost.toLocaleString('ko-KR')}p</p>
                  {discountReady ? <p className="text-[10px] text-[#facc15]">기운 3개 할인 적용</p> : null}
                </div>

                <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--fg)_14%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_78%,transparent)] px-2 py-1.5 text-center">
                  <p className="text-[10px] text-[color:var(--muted)]">판매 예상 금액</p>
                  <p className={`font-black ${canSell ? 'text-[#86efac]' : 'text-[color:var(--muted)]'}`}>
                    {(status?.sellPrice ?? 0).toLocaleString('ko-KR')}p
                  </p>
                  {!canSell ? <p className="text-[10px] text-[color:var(--muted)]">0p일 때 판매 불가</p> : null}
                </div>
              </div>
            </div>

            <p className="pointer-events-auto card-glass rounded-full px-3 py-1.5 text-center text-xs font-medium text-[color:var(--fg)]">
              {lastMessage}
            </p>

            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleEnhance();
                }}
                disabled={loading || busy || !status}
                className="inline-flex h-11 min-w-[134px] items-center justify-center gap-1 overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--accent-pink)_30%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent-pink-2)_20%,var(--card)),color-mix(in_srgb,var(--accent-lavender)_16%,var(--card)))] bg-clip-padding px-4 py-2.5 text-sm font-black leading-none text-[color:var(--fg)] shadow-[0_8px_18px_rgba(12,16,28,0.14)] transition-[filter,border-color] duration-150 ease-out hover:brightness-[1.02] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Hammer className="h-4 w-4" />
                {busy ? '강화 중...' : discountReady ? '강화하기 -50%' : '강화하기'}
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleSell();
                }}
                disabled={loading || busy || !status || !canSell}
                className="inline-flex h-11 min-w-[134px] items-center justify-center overflow-hidden rounded-xl border border-[color:var(--border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--chip)_90%,transparent))] bg-clip-padding px-4 py-2.5 text-sm font-black leading-none text-[color:var(--fg)] shadow-[0_8px_18px_rgba(12,16,28,0.10)] transition-[filter,border-color] duration-150 ease-out hover:brightness-[1.015] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sellBlockedByZeroPrice ? '판매 불가 (0p)' : '판매하기'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
