'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { ArrowRight, Dices, Package, Sparkles, LogOut, Coins } from 'lucide-react';
import { signOut } from 'next-auth/react';

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
  return (
    <m.section
      initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl card-glass p-6 overflow-hidden relative"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -right-10 h-64 w-64 rounded-full bg-[color:var(--accent-sky)]/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-[color:var(--accent-pink)]/10 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">내 정보</h1>
          </div>
          <m.button
            whileHover={{ scale:1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => void signOut({ callbackUrl: '/' })}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--muted)] hover:text-red-400 transition-colors"
            aria-label="로그아웃"
          >
            <LogOut className="h-5 w-5" />
          </m.button>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-6">
          <m.div
            whileHover={{ rotate: 2, scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="relative self-start"
          >
            <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-[color:var(--accent-pink)]/18 to-[color:var(--accent-lavender)]/14 blur-xl" />
            {props.children || props.fallbackAvatar}
          </m.div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-2xl font-bold text-[color:var(--fg)] truncate">{props.user.name}</div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] text-[10px] font-bold text-[color:var(--accent-pink)]">
                <Sparkles className="h-3 w-3" />
                MEMBER
              </div>
            </div>
            <div className="text-sm muted mb-4">Discord 계정으로 로그인되어 있어.</div>
            
            <div className="inline-flex items-center gap-3 rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[color:var(--accent-pink)]/10 to-transparent p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--accent-pink)] text-white shadow-lg shadow-pink-500/20">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold muted-2 uppercase tracking-wider">보유 포인트</div>
                <div className="text-lg font-bold text-[color:var(--fg)]">
                  {props.user.points.toLocaleString()} <span className="text-sm font-medium opacity-60 ml-0.5">P</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            <Link
              className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-4 text-sm font-semibold inline-flex w-full items-center justify-between hover:bg-[color:var(--bg)] transition-colors shadow-sm"
              href="/inventory"
            >
              <span className="inline-flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--accent-lavender)]/20 text-[color:var(--accent-lavender)]">
                  <Package className="h-4 w-4" />
                </div>
                인벤토리로 이동
              </span>
              <ArrowRight className="h-4 w-4 opacity-40" />
            </Link>
          </m.div>

          <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            <Link
              className="rounded-2xl btn-bangul px-4 py-4 text-sm font-semibold inline-flex w-full items-center justify-between shadow-lg"
              href="/draw"
            >
              <span className="inline-flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
                  <Dices className="h-4 w-4" />
                </div>
                뽑기 하러 가기
              </span>
              <ArrowRight className="h-4 w-4 opacity-80" />
            </Link>
          </m.div>
        </div>
      </div>
    </m.section>
  );
}
