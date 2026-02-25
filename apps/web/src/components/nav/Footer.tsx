"use client";

import Image from 'next/image';
import Link from 'next/link';

type FooterProps = {
  user: { name: string; imageUrl: string | null } | null;
};

export default function Footer({ user }: FooterProps) {
  void user;
  return (
    <footer className="relative mt-20 border-t border-[color:var(--border)] bg-[color:var(--card)]/30 backdrop-blur-sm overflow-hidden">
      {/* 장식용 그라데이션 라인 */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[color:var(--accent-pink)]/50 to-transparent opacity-50" />

      {/* Ambient gradient blobs for depth */}
      <div className="pointer-events-none absolute inset-0 -z-[1]">
        <div className="absolute -top-20 left-1/4 h-40 w-40 rounded-full bg-[color:var(--accent-pink)]/5 blur-3xl" />
        <div className="absolute -bottom-16 right-1/3 h-32 w-32 rounded-full bg-[color:var(--accent-lavender)]/5 blur-3xl" />
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 relative z-10">
        <div className="grid gap-8 md:grid-cols-4 lg:gap-12">
          {/* 브랜드 섹션 */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] shadow-sm overflow-hidden">
                {/* Subtle gradient ring behind icon */}
                <span className="absolute inset-0 bg-gradient-to-br from-[color:var(--accent-pink)]/15 to-[color:var(--accent-lavender)]/10" />
                <Image src="/icon.jpg" alt="" width={32} height={32} className="relative h-8 w-8 rounded-xl" />
              </span>
              <div>
                <div className="text-[10px] font-bold tracking-[0.22em] text-[color:var(--accent-pink)]">BANGULNYANG</div>
                <div className="text-lg font-bold font-bangul text-[color:var(--fg)] leading-tight">방울냥</div>
              </div>
            </div>
            <p className="text-sm text-[color:var(--muted)] leading-relaxed max-w-xs">
              귀여운 고양이들과 함께하는 즐거운 디스코드 라이프! <br />
              매일매일 새로운 즐거움을 찾아보세요.
            </p>
          </div>

          {/* 링크 섹션 1 */}
          <div>
            <h3 className="font-semibold text-[11px] tracking-[0.14em] text-[color:var(--muted-2)] uppercase mb-4">서비스</h3>
            <ul className="space-y-3 text-sm text-[color:var(--muted)]">
              <li>
                <Link href="/draw" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  뽑기
                </Link>
              </li>
              <li>
                <Link href="/inventory" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  인벤토리
                </Link>
              </li>
              <li>
                <Link href="/music" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  음악
                </Link>
              </li>
              <li>
                <Link href="/support" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  문의하기
                </Link>
              </li>
            </ul>
          </div>

          {/* 링크 섹션 2 (정책) */}
          <div>
            <h3 className="font-semibold text-[11px] tracking-[0.14em] text-[color:var(--muted-2)] uppercase mb-4">정책</h3>
            <ul className="space-y-3 text-sm text-[color:var(--muted)]">
              <li>
                <Link href="/terms" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="group inline-flex items-center gap-1.5 hover:text-[color:var(--accent-pink)] transition-colors">
                  <span className="h-px w-0 bg-[color:var(--accent-pink)] transition-all group-hover:w-3" />
                  개인정보 처리방침
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 하단 저작권 */}
        <div className="mt-12 pt-8 border-t border-[color:var(--border)] flex flex-wrap justify-between items-center gap-4">
          <div className="text-xs text-[color:var(--muted-2)]">
            © {new Date().getFullYear()} 방울냥. All rights reserved.
          </div>
          {/* Status indicator — enhanced pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,#4ade80_28%,var(--border))] bg-[color:color-mix(in_srgb,#4ade80_6%,var(--chip))] px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            <span className="text-xs font-semibold text-[color:var(--fg)]">All Systems Operational</span>
          </div>
        </div>
      </div>
      
      {/* 배경 배너 이미지 (흐릿하게) */}
      <div className="absolute inset-0 -z-10 opacity-[0.03] pointer-events-none select-none">
        <Image 
          src="/banner.png" 
          alt="" 
          fill
          className="object-cover object-center grayscale"
        />
      </div>
    </footer>
  );
}
