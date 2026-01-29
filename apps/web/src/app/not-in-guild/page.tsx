'use client';

import Link from 'next/link';
import { m, AnimatePresence } from 'framer-motion';
import { UserMinus, ArrowRight, HelpCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export default function NotInGuildPage() {
  const [showDebug, setShowDebug] = useState(false);
  const inviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? 'https://discord.gg/tinklepaw';

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6 relative overflow-hidden">
      {/* Bg decorations */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-amber-500/10 blur-[100px]" />
        <div className="absolute top-20 right-20 h-64 w-64 rounded-full bg-[color:var(--accent-pink)]/5 blur-[80px]" />
      </div>

      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-[32px] card-glass p-8 sm:p-12 text-center relative"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.15)]">
          <UserMinus className="h-10 w-10" strokeWidth={1.5} />
        </div>

        <div className="text-[11px] font-bold tracking-[0.3em] text-amber-500 mb-2 uppercase">Membership Required</div>
        <h1 className="text-3xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">서버 멤버가 아니야</h1>
        
        <p className="mt-4 text-sm muted leading-relaxed">
          이 페이지는 <span className="font-bold text-[color:var(--fg)]">방울냥 서버 멤버</span>만 사용할 수 있어.<br />
          아래 버튼을 눌러 먼저 서버에 입주해줘!
        </p>

        <div className="mt-10 flex flex-col gap-3">
          <m.a
            href={inviteUrl}
            target="_blank"
            rel="noreferrer"
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 py-4 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-colors"
          >
            방울냥 서버 입장하기
            <ArrowRight className="h-4 w-4" />
          </m.a>
          
          <m.div whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }}>
            <Link 
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-5 py-3.5 text-sm font-semibold hover:bg-[color:var(--bg)] transition-colors" 
              href="/"
            >
              홈으로 가기
            </Link>
          </m.div>
        </div>

        <div className="mt-10 border-t border-[color:var(--border)] pt-6">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-1.5 mx-auto text-xs font-semibold muted hover:text-[color:var(--fg)] transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            문제가 계속되나요?
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDebug ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showDebug && (
              <m.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 rounded-2xl border border-[color:var(--border)] bg-black/5 dark:bg-black/20 p-4 text-left">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--muted-2)]">Debug Information</div>
                  <div className="mt-2 text-[11px] leading-relaxed muted">
                    이미 서버에 있다면 <code className="rounded bg-[color:var(--chip)] px-1 font-mono">NYARU_GUILD_ID</code> 설정이 올바른지 관리자에게 문의해줘.
                  </div>
                  <Link 
                    href="/api/debug/guild-member" 
                    className="mt-3 inline-block text-[10px] font-bold text-[color:var(--accent-pink)] hover:underline"
                  >
                    데이터 조회해보기 →
                  </Link>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.div>
    </main>
  );
}
