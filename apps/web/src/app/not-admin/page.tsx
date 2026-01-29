'use client';

import Link from 'next/link';
import { m } from 'framer-motion';
import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';

export default function NotAdminPage() {
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6 relative overflow-hidden">
      {/* Bg decorations */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-red-500/10 blur-[100px]" />
      </div>

      <m.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-[32px] card-glass p-8 sm:p-12 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-red-400/50 via-red-500/50 to-red-400/50" />
        
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 border border-red-500/20 text-red-500 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
          <ShieldAlert className="h-10 w-10" strokeWidth={1.5} />
        </div>

        <div className="text-[11px] font-bold tracking-[0.3em] text-red-400 mb-2 uppercase">Restricted Access</div>
        <h1 className="text-3xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">관리자 전용 구역</h1>
        
        <p className="mt-4 text-sm muted leading-relaxed">
          이곳은 서버 권한(<span className="font-bold text-[color:var(--fg)]">Administrator</span>)이 있는<br />
          멤버만 접근할 수 있는 비밀 공간이야.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
          <m.div className="w-full" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
            <Link 
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-5 py-4 text-sm font-semibold hover:bg-[color:var(--bg)] transition-colors" 
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              홈으로 돌아가기
            </Link>
          </m.div>
          
          <m.div className="w-full" whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
            <Link 
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl btn-soft px-5 py-4 text-sm font-semibold" 
              href="/support"
            >
              <Lock className="h-4 w-4" />
              권한 문의하기
            </Link>
          </m.div>
        </div>

        <div className="mt-8 text-[11px] muted-2">
          계정이 잘못되었다면 로그아웃 후 다시 시도해봐!
        </div>
      </m.div>
    </main>
  );
}
