'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  Coins,
  Dices,
  LogOut,
  Package,
  Sparkles,
  Ticket,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

type UserView = {
  name: string;
  imageUrl: string | null;
  points: number;
};

export default function MeClient(props: {
  user: UserView;
  children: ReactNode;
  fallbackAvatar: ReactNode;
}) {
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const previousPointsRef = useRef(0);
  const pointsTweenRef = useRef<gsap.core.Tween | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const pointsCardRef = useRef<HTMLDivElement | null>(null);
  const pointsValueRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotionRef = useRef(false);

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
    if (prefersReducedMotionRef.current) return;

    const section = sectionRef.current;
    if (!section) return;

    const targets = Array.from(
      section.querySelectorAll<HTMLElement>('[data-me-scroll-reveal]'),
    );

    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { y: 20, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 78%',
            once: true
          }
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const nextPoints = props.user.points;
    const previousPoints = previousPointsRef.current;

    if (prefersReducedMotionRef.current) {
      previousPointsRef.current = nextPoints;
      setAnimatedPoints(nextPoints);
      return;
    }

    pointsTweenRef.current?.kill();

    const counter = { value: previousPoints };
    pointsTweenRef.current = gsap.to(counter, {
      value: nextPoints,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => {
        const rounded = Math.round(counter.value);
        previousPointsRef.current = rounded;
        setAnimatedPoints(rounded);
      },
      onComplete: () => {
        previousPointsRef.current = nextPoints;
        setAnimatedPoints(nextPoints);
      }
    });

    if (pointsCardRef.current && pointsValueRef.current) {
      gsap.fromTo(
        pointsCardRef.current,
        { autoAlpha: 0.72, y: 10, scale: 0.98 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.32,
          ease: 'power2.out',
          overwrite: 'auto'
        }
      );

      gsap.fromTo(
        pointsValueRef.current,
        { y: 6, autoAlpha: 0.64 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.35,
          ease: 'power2.out',
          overwrite: 'auto'
        }
      );
    }

    return () => {
      pointsTweenRef.current?.kill();
    };
  }, [props.user.points]);

  useEffect(() => {
    return () => {
      pointsTweenRef.current?.kill();
    };
  }, []);

  return (
    <m.section
      ref={sectionRef}
      initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] card-glass p-5 sm:p-7 lg:p-8"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-[color:var(--accent-sky)]/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-[color:var(--accent-pink)]/10 blur-3xl" />
      </div>

      <div className="relative space-y-7">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-[0.26em] muted-2">BANGULNYANG PROFILE</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight font-bangul sm:text-[2.1rem]">내 정보</h1>
            <p className="mt-2 text-sm muted">계정 상태와 포인트, 자주 쓰는 기능을 한 번에 확인해요.</p>
          </div>
          <m.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] transition-colors hover:text-red-400"
            aria-label="로그아웃"
          >
            <LogOut className="h-5 w-5" />
          </m.button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
          <article
            data-me-scroll-reveal
            className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_88%,transparent)] p-5 shadow-[0_14px_34px_rgba(8,12,24,0.08)]"
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <m.div
                whileHover={{ rotate: 2, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="relative self-start"
              >
                <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-[color:var(--accent-pink)]/18 to-[color:var(--accent-lavender)]/14 blur-xl" />
                {props.children || props.fallbackAvatar}
              </m.div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <div className="truncate text-2xl font-bold text-[color:var(--fg)]">{props.user.name}</div>
                  <div className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent-pink)]">
                    <Sparkles className="h-3 w-3" />
                    MEMBER
                  </div>
                </div>
                <div className="mb-4 text-sm muted">Discord 계정 연동 상태가 정상이에요.</div>

                <div
                  ref={pointsCardRef}
                  className="inline-flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--accent-pink)]/10 to-transparent p-4"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent-pink)] text-white shadow-lg shadow-pink-500/20">
                    <Coins className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider muted-2">보유 포인트</div>
                    <div ref={pointsValueRef} className="text-lg font-bold text-[color:var(--fg)]">
                      {animatedPoints.toLocaleString()} <span className="ml-0.5 text-sm font-medium opacity-60">P</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article
            data-me-scroll-reveal
            className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5"
          >
            <h2 className="text-sm font-semibold tracking-[0.1em] muted-2">오늘 확인하면 좋은 것</h2>
            <ul className="mt-3 space-y-2 text-sm text-[color:var(--fg)]">
              <li className="rounded-xl border border-[color:color-mix(in_srgb,var(--fg)_10%,transparent)] bg-[color:var(--chip)] px-3 py-2">일일상자와 복권으로 포인트 흐름 체크하기</li>
              <li className="rounded-xl border border-[color:color-mix(in_srgb,var(--fg)_10%,transparent)] bg-[color:var(--chip)] px-3 py-2">인벤토리에서 장착 상태 확인하기</li>
              <li className="rounded-xl border border-[color:color-mix(in_srgb,var(--fg)_10%,transparent)] bg-[color:var(--chip)] px-3 py-2">강화 페이지에서 손익/판매 가능 여부 보기</li>
            </ul>
          </article>
        </div>

        <section
          data-me-scroll-reveal
          className="rounded-3xl border border-[color:var(--border)] bg-[color:color-mix(in_srgb,var(--card)_90%,transparent)] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold font-bangul text-[color:var(--fg)]">빠른 이동</h2>
            <span className="text-xs muted">자주 쓰는 기능 바로가기</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
              <Link
                className="inline-flex w-full items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-4 text-sm font-semibold shadow-sm transition-colors hover:bg-[color:var(--bg)]"
                href="/inventory"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent-lavender)]/20 text-[color:var(--accent-lavender)]">
                    <Package className="h-4 w-4" />
                  </span>
                  인벤토리
                </span>
                <ArrowRight className="h-4 w-4 opacity-40" />
              </Link>
            </m.div>

            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
              <Link
                className="inline-flex w-full items-center justify-between rounded-2xl btn-bangul px-4 py-4 text-sm font-semibold shadow-lg"
                href="/draw"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
                    <Dices className="h-4 w-4" />
                  </span>
                  뽑기
                </span>
                <ArrowRight className="h-4 w-4 opacity-80" />
              </Link>
            </m.div>

            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
              <Link
                className="inline-flex w-full items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-4 text-sm font-semibold shadow-sm transition-colors hover:bg-[color:var(--bg)]"
                href="/forge"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent-pink)]/20 text-[color:var(--accent-pink)]">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  강화
                </span>
                <ArrowRight className="h-4 w-4 opacity-40" />
              </Link>
            </m.div>

            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
              <Link
                className="inline-flex w-full items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-4 text-sm font-semibold shadow-sm transition-colors hover:bg-[color:var(--bg)]"
                href="/lotto"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent-sky)]/20 text-[color:var(--accent-sky)]">
                    <Ticket className="h-4 w-4" />
                  </span>
                  복권 현황
                </span>
                <ArrowRight className="h-4 w-4 opacity-40" />
              </Link>
            </m.div>

            <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
              <Link
                className="inline-flex w-full items-center justify-between rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-4 text-sm font-semibold shadow-sm transition-colors hover:bg-[color:var(--bg)]"
                href="/notifications"
              >
                <span className="inline-flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent-lime)]/20 text-[color:var(--accent-lime)]">
                    <Bell className="h-4 w-4" />
                  </span>
                  알림
                </span>
                <ArrowRight className="h-4 w-4 opacity-40" />
              </Link>
            </m.div>
          </div>
        </section>
      </div>
    </m.section>
  );
}
