'use client';

import Link from 'next/link';
import { AnimatePresence, m } from 'framer-motion';
import { ArrowRight, MessageCircle, ShieldCheck } from 'lucide-react';

import DiscordMark from '@/components/icons/DiscordMark';

export default function SupportClient(props: { inviteUrl: string; homeHref: string }) {
  return (
    <m.section
      initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl card-glass p-6 overflow-hidden relative"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-[color:var(--accent-pink)]/10 blur-3xl" />
        <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-[color:var(--accent-lavender)]/10 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] tracking-[0.28em] muted-2">BANGULNYANG</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight font-bangul">문의</h1>
            <p className="mt-2 text-sm muted">서버/봇 관련 도움이 필요하면 아래 방법으로 알려줘.</p>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2">
            <ShieldCheck className="h-4 w-4 text-[color:var(--accent-mint)]" strokeWidth={2.2} />
            <span className="text-xs font-semibold text-[color:var(--fg)]">로그/토큰은 노출 금지</span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <m.a
            href={props.inviteUrl}
            target="_blank"
            rel="noreferrer"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="rounded-2xl btn-discord px-4 py-3 text-sm font-semibold inline-flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <DiscordMark className="h-4 w-4" />
              디스코드에서 문의하기
            </span>
            <ArrowRight className="h-4 w-4 opacity-80" />
          </m.a>

          <m.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            <Link
              className="rounded-2xl btn-bangul px-4 py-3 text-sm font-semibold inline-flex w-full items-center justify-between"
              href={props.homeHref}
            >
              <span className="inline-flex items-center gap-2">
                <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
                홈으로
              </span>
              <ArrowRight className="h-4 w-4 opacity-80" />
            </Link>
          </m.div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-4"
          >
            <div className="text-sm font-semibold text-[color:var(--fg)]">빠르게 해결하려면</div>
            <div className="mt-2 text-sm muted leading-relaxed">
              어떤 화면에서 문제가 났는지, 언제부터인지, 그리고 가능한 재현 방법을 같이 적어주면 빨라요.
            </div>
            <div className="mt-3 text-xs muted-2">예: /draw에서 10회 뽑기 누르면 500이 떠요</div>
          </m.div>

          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] p-4"
          >
            <div className="text-sm font-semibold text-[color:var(--fg)]">다음에 붙일 것</div>
            <div className="mt-2 text-sm muted leading-relaxed">문의 폼, 자동 티켓 채널 생성, FAQ 페이지 등을 붙일 수 있어요.</div>
            <AnimatePresence initial={false}>
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-xs font-semibold text-[color:var(--accent-pink)]"
              >
                준비 중
              </m.div>
            </AnimatePresence>
          </m.div>
        </div>
      </div>
    </m.section>
  );
}
