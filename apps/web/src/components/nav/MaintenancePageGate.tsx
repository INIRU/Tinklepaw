"use client";

import { useEffect, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { Clock3, ShieldAlert, Sparkles, Wrench } from 'lucide-react';

type Props = {
  enabled: boolean;
  reason: string | null;
  until: string | null;
  targetPaths: string[];
  adminBypass: boolean;
  children: React.ReactNode;
};

function normalizeTargetPaths(items: string[]) {
  const normalized = items
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('/') ? item : `/${item}`))
    .map((item) => (item === '/' ? item : item.replace(/\/+$/, '')))
    .slice(0, 128);
  return Array.from(new Set(normalized));
}

function matchesPath(pathname: string, target: string) {
  if (!target) return false;
  if (target === '/') return pathname === '/';

  if (target.endsWith('*')) {
    const prefix = target.slice(0, -1);
    if (!prefix) return false;
    return pathname.startsWith(prefix);
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

function formatRemaining(untilMs: number) {
  const diffMs = untilMs - Date.now();
  if (diffMs <= 0) return '예정 시각 경과';

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${Math.max(mins, 1)}분 남음`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 ${mins % 60}분 남음`;

  const days = Math.floor(hours / 24);
  return `${days}일 ${hours % 24}시간 남음`;
}

export default function MaintenancePageGate({
  enabled,
  reason,
  until,
  targetPaths,
  adminBypass,
  children,
}: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const pathname = usePathname() || '/';

  const normalizedTargets = useMemo(() => normalizeTargetPaths(targetPaths), [targetPaths]);
  const inScope = normalizedTargets.length === 0 || normalizedTargets.some((target) => matchesPath(pathname, target));
  const locked = enabled && !adminBypass && inScope;

  if (!locked) return <>{children}</>;

  const untilMs = until ? Date.parse(until) : Number.NaN;
  const untilLabel = Number.isFinite(untilMs)
    ? new Date(untilMs).toLocaleString('ko-KR', { hour12: false })
    : null;
  const remainingLabel = Number.isFinite(untilMs) ? formatRemaining(untilMs) : null;
  const targetLabel = normalizedTargets.length === 0
    ? '전체 페이지'
    : `${normalizedTargets.slice(0, 3).join(', ')}${normalizedTargets.length > 3 ? ` 외 ${normalizedTargets.length - 3}개` : ''}`;

  useEffect(() => {
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion) {
        gsap.set('[data-maintenance-reveal]', { autoAlpha: 1, y: 0, filter: 'blur(0px)' });
        return;
      }

      gsap.set('[data-maintenance-reveal]', { autoAlpha: 0, y: 20, filter: 'blur(10px)' });

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .to('[data-maintenance-reveal]', {
          autoAlpha: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.84,
          stagger: 0.08,
        });

      gsap.to('[data-maintenance-orb-a]', {
        x: 32,
        y: -24,
        scale: 1.08,
        duration: 6.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('[data-maintenance-orb-b]', {
        x: -26,
        y: 20,
        scale: 1.06,
        duration: 7.4,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
      gsap.to('[data-maintenance-sparkle]', {
        y: -10,
        opacity: 0.42,
        duration: 1.8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: 0.12,
      });
      gsap.fromTo(
        '[data-maintenance-shimmer]',
        { xPercent: -120 },
        {
          xPercent: 120,
          duration: 3.8,
          ease: 'none',
          repeat: -1,
          repeatDelay: 1.1,
        },
      );
      gsap.to('[data-maintenance-ring]', {
        rotate: 360,
        duration: 24,
        ease: 'none',
        repeat: -1,
      });
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <main ref={rootRef} className="relative mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-5xl items-center px-4 py-8 sm:py-12">
      <div data-maintenance-orb-a className="pointer-events-none absolute -left-10 top-10 h-48 w-48 rounded-full bg-[color:var(--accent-sky)]/16 blur-3xl" />
      <div data-maintenance-orb-b className="pointer-events-none absolute -right-8 bottom-10 h-56 w-56 rounded-full bg-[color:var(--accent-pink)]/18 blur-3xl" />

      <section className="relative w-full overflow-hidden rounded-[32px] border border-[color:var(--border)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--accent-sky)_10%,var(--card)),color-mix(in_srgb,var(--accent-pink)_8%,var(--card)))] p-6 shadow-[0_28px_58px_rgba(0,0,0,0.2)] sm:p-9">
        <div data-maintenance-shimmer className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.12),transparent)]" />
        <div className="pointer-events-none absolute right-8 top-8 h-20 w-20 rounded-full border border-white/20" data-maintenance-ring />
        <Sparkles data-maintenance-sparkle className="pointer-events-none absolute right-10 top-12 h-4 w-4 text-[color:var(--accent-sky)]/60" />
        <Sparkles data-maintenance-sparkle className="pointer-events-none absolute right-24 top-16 h-3 w-3 text-[color:var(--accent-pink)]/60" />
        <Sparkles data-maintenance-sparkle className="pointer-events-none absolute right-16 top-28 h-2.5 w-2.5 text-[color:var(--accent-sky)]/55" />

        <div className="relative">
          <div data-maintenance-reveal className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)]/80 px-3 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-[color:var(--muted-2)]">
            <ShieldAlert className="h-3.5 w-3.5 text-[color:var(--accent-pink)]" />
            MAINTENANCE MODE
          </div>

          <h1 data-maintenance-reveal className="mt-3 text-2xl font-black text-[color:var(--fg)] sm:text-3xl">현재 점검 중입니다</h1>
          <p data-maintenance-reveal className="mt-3 max-w-3xl text-sm leading-relaxed text-[color:color-mix(in_srgb,var(--fg)_76%,transparent)]">
            서비스 안정화를 위해 현재 페이지 접근을 제한했습니다. 관리자라면 우측 하단 실드 버튼으로 관리자 모드를 켜고 즉시 접근할 수 있습니다.
          </p>

          <div data-maintenance-reveal className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]/70 px-3 py-2 text-xs text-[color:var(--fg)]">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--accent-sky)]" />
            점검 대상: {targetLabel}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <article data-maintenance-reveal className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[color:var(--muted-2)]">
                <Wrench className="h-3.5 w-3.5 text-[color:var(--accent-pink)]" />
                점검 사유
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--fg)]">
                {reason?.trim() ? reason : '서비스 품질 개선 작업'}
              </div>
            </article>

            <article data-maintenance-reveal className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-[color:var(--muted-2)]">
                <Clock3 className="h-3.5 w-3.5 text-[color:var(--accent-sky)]" />
                예상 종료
              </div>
              <div className="mt-2 text-sm font-semibold text-[color:var(--fg)]">{untilLabel || '종료 시각 미정'}</div>
              <div className="mt-1 text-xs text-[color:color-mix(in_srgb,var(--fg)_68%,transparent)]">{remainingLabel || '진행 상황에 따라 조정될 수 있습니다.'}</div>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
