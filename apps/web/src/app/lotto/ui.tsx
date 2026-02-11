'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Sparkles, Trophy } from 'lucide-react';

type LottoStatus = {
  jackpotPoolPoints: number;
  jackpotActivityRatePct: number;
  lastJackpotPayout: number;
  lastJackpotAt: string | null;
};

const toSafeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const formatJackpotAt = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function LottoClient() {
  const inviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? 'https://discord.gg/tinklepaw';

  const [status, setStatus] = useState<LottoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [animatedJackpot, setAnimatedJackpot] = useState(0);
  const animatedJackpotRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/gacha/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Partial<LottoStatus>;

      setStatus({
        jackpotPoolPoints: Math.max(0, Math.floor(toSafeNumber(body.jackpotPoolPoints))),
        jackpotActivityRatePct: Math.max(0, toSafeNumber(body.jackpotActivityRatePct)),
        lastJackpotPayout: Math.max(0, Math.floor(toSafeNumber(body.lastJackpotPayout))),
        lastJackpotAt: body.lastJackpotAt ?? null,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '잭팟 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(() => {
      void fetchStatus();
    }, 15000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  useEffect(() => {
    const target = Math.max(0, status?.jackpotPoolPoints ?? 0);
    const start = animatedJackpotRef.current;

    if (target === start) return;

    const durationMs = 900;
    const startedAt = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(start + (target - start) * eased);
      animatedJackpotRef.current = nextValue;
      setAnimatedJackpot(nextValue);

      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status?.jackpotPoolPoints]);

  const jackpotTimeLabel = useMemo(() => formatJackpotAt(status?.lastJackpotAt ?? null), [status?.lastJackpotAt]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <section className="rounded-3xl border border-[color:color-mix(in_srgb,var(--accent-pink)_30%,var(--border))] bg-[linear-gradient(140deg,color-mix(in_srgb,var(--accent-pink)_20%,var(--card)),color-mix(in_srgb,var(--accent-lavender)_12%,var(--card)))] p-6 shadow-[0_22px_54px_rgba(8,12,28,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-[color:var(--muted)]">JACKPOT</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight font-bangul text-[color:var(--fg)]">잭팟 현황</h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">꽝 결과와 서버 활동 보상 일부가 잭팟 풀에 누적됩니다.</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:color-mix(in_srgb,var(--fg)_18%,transparent)] bg-[color:color-mix(in_srgb,var(--card)_82%,transparent)] px-3 py-1 text-[11px] font-semibold text-[color:var(--muted)]">
            <Sparkles className="h-3.5 w-3.5" />
            활동 적립 {toSafeNumber(status?.jackpotActivityRatePct).toFixed(1)}%
          </span>
        </div>

        <div className="mt-6 rounded-2xl border border-[color:color-mix(in_srgb,#facc15_32%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,#facc15_16%,var(--card)),color-mix(in_srgb,#facc15_8%,var(--card)))] px-5 py-4">
          <p className="text-xs font-semibold text-[color:var(--muted)]">현재 누적 잭팟</p>
          <p className="mt-1 text-4xl font-black tracking-tight text-[#facc15]">{loading ? '...' : `${animatedJackpot.toLocaleString('ko-KR')}p`}</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[color:var(--muted)]">최근 잭팟 당첨금</p>
            <p className="mt-1 text-lg font-black text-[color:var(--fg)]">
              {(status?.lastJackpotPayout ?? 0) > 0 ? `${(status?.lastJackpotPayout ?? 0).toLocaleString('ko-KR')}p` : '아직 없음'}
            </p>
            <p className="mt-1 text-[11px] text-[color:var(--muted)]">{jackpotTimeLabel ? `${jackpotTimeLabel}` : '다음 첫 당첨을 기다리는 중'}</p>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[color:var(--muted)]">안내</p>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--fg)]">복권 뽑기는 디스코드에서 `/lottery` 명령어로 진행돼요. 채팅/음성 활동이 쌓일수록 잭팟도 함께 자랍니다.</p>
          </div>
        </div>

        {error ? <p className="mt-4 text-xs text-[#f87171]">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_84%,transparent)] px-4 py-2 text-sm font-semibold text-[color:var(--fg)] transition hover:brightness-105"
          >
            <Trophy className="h-4 w-4" />
            디코에서 /lottery
          </a>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_84%,transparent)] px-4 py-2 text-sm font-semibold text-[color:var(--fg)] transition hover:brightness-105"
          >
            <Coins className="h-4 w-4" />
            홈으로
          </Link>
        </div>
      </section>
    </main>
  );
}
