'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { m } from 'framer-motion';
import Image from 'next/image';

import DiscordMark from '@/components/icons/DiscordMark';

export default function LoginClient(props: { bannerSrc: string }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[color:var(--accent-pink)]/10 blur-[120px]" />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[color:var(--accent-lavender)]/8 blur-[100px]" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[color:var(--accent-sky)]/8 blur-[100px]" />
      </div>

      <m.div 
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md rounded-[32px] card-glass p-7 sm:p-10 shadow-[0_24px_68px_rgba(0,0,0,0.12)] border-white/20"
      >
        <div className="text-center">
          <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-pink)] opacity-80 mb-2">BANGULNYANG</div>
          <h1 className="text-4xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">로그인</h1>
          <p className="mt-3 text-sm muted leading-relaxed">뽑기/인벤토리를 사용하려면<br />Discord 로그인(서버 멤버)이 필요해.</p>
        </div>

        <m.div 
          className="mt-8 overflow-hidden rounded-2xl border border-white/10 shadow-inner group"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.3 }}
        >
          <Image
            src={props.bannerSrc}
            alt="동글동글 방울냥 배너"
            width={1600}
            height={600}
            className="h-auto w-full transition-transform duration-700 group-hover:scale-105"
            priority
          />
        </m.div>

        <m.button
          type="button"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl btn-discord px-4 py-4 text-sm font-bold shadow-lg shadow-indigo-500/20"
          whileTap={{ scale: 0.96 }}
          whileHover={{ y: -2, filter: 'brightness(1.05)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          onClick={() => signIn('discord', { callbackUrl })}
        >
          <DiscordMark className="h-5 w-5" />
          <span>Discord로 계속하기</span>
        </m.button>
        
        <div className="mt-8 flex flex-col gap-1 text-center">
          <p className="text-[11px] muted-2">권한 확인은 서버에서만 수행돼요.</p>
          <p className="text-[11px] muted-2">토큰은 브라우저에 노출되지 않으니 안심해!</p>
        </div>
      </m.div>
    </main>
  );
}
