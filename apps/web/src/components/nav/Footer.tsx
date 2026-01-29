"use client";

import Image from 'next/image';
import Link from 'next/link';

type FooterProps = {
  user: { name: string; imageUrl: string | null } | null;
};

export default function Footer({ user }: FooterProps) {
  return (
    <footer className="relative mt-20 border-t border-[color:var(--border)] bg-[color:var(--card)]/30 backdrop-blur-sm overflow-hidden">
      {/* 장식용 그라데이션 라인 */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[color:var(--accent-pink)]/50 to-transparent opacity-50" />

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 relative z-10">
        <div className="grid gap-8 md:grid-cols-4 lg:gap-12">
          {/* 브랜드 섹션 */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] shadow-sm">
                <Image src="/icon.jpg" alt="" width={32} height={32} className="h-8 w-8 rounded-xl" />
              </span>
              <div>
                <div className="text-[10px] font-bold tracking-[0.2em] text-[color:var(--accent-pink)]">BANGULNYANG</div>
                <div className="text-lg font-bold font-bangul text-[color:var(--fg)]">방울냥</div>
              </div>
            </div>
            <p className="text-sm text-[color:var(--muted)] leading-relaxed max-w-sm">
              귀여운 고양이들과 함께하는 즐거운 디스코드 라이프! <br />
              매일매일 새로운 즐거움을 찾아보세요.
            </p>
          </div>

          {/* 링크 섹션 1 */}
          <div>
            <h3 className="font-semibold text-sm text-[color:var(--fg)] mb-4">서비스</h3>
            <ul className="space-y-3 text-sm text-[color:var(--muted)]">
              <li>
                <Link href="/draw" className="hover:text-[color:var(--accent-pink)] transition-colors">
                  뽑기
                </Link>
              </li>
              <li>
                <Link href="/inventory" className="hover:text-[color:var(--accent-pink)] transition-colors">
                  인벤토리
                </Link>
              </li>
              <li>
                <Link href="/music" className="hover:text-[color:var(--accent-pink)] transition-colors">
                  음악
                </Link>
              </li>
              <li>
                <Link href="/support" className="hover:text-[color:var(--accent-pink)] transition-colors">
                  문의하기
                </Link>
              </li>
            </ul>
          </div>

          {/* 링크 섹션 2 (정책) */}
          <div>
            <h3 className="font-semibold text-sm text-[color:var(--fg)] mb-4">정책</h3>
            <ul className="space-y-3 text-sm text-[color:var(--muted)]">
              <li>
                <Link href="/terms" className="hover:text-[color:var(--accent-pink)] transition-colors">
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-[color:var(--accent-pink)] transition-colors">
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
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-[color:var(--muted)]">All Systems Operational</span>
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
