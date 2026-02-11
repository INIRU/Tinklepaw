'use client';

import Link from 'next/link';
import { m } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react';
import { Dices, Package, MessageCircle, User, Hammer, Trophy } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

type Item = {
  title: string;
  desc: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tint: 'pink' | 'sky' | 'lavender' | 'mint';
};

const items: Item[] = [
  { title: '뽑기', desc: '멋진 연출과 함께 역할 아이템을 뽑아봐', href: '/draw', icon: Dices, tint: 'pink' },
  { title: '잭팟', desc: '복권 누적금과 최근 당첨 현황 보기', href: '/lotto', icon: Trophy, tint: 'sky' },
  { title: '인벤토리', desc: '보유/장착 상태 확인', href: '/inventory', icon: Package, tint: 'lavender' },
  { title: '강화', desc: '참치캔 강화 후 포인트로 판매', href: '/forge', icon: Hammer, tint: 'mint' },
  { title: '문의', desc: '도움이 필요하면 여기로', href: '/support', icon: MessageCircle, tint: 'sky' },
  { title: '내 정보', desc: '내 프로필/설정', href: '/me', icon: User, tint: 'mint' }
];

const TINT: Record<Item['tint'], { from: string; to: string; fg: string }> = {
  pink: { from: 'from-[color:var(--accent-pink)]/30', to: 'to-[color:var(--accent-pink-2)]/15', fg: 'text-[color:var(--accent-pink)]' },
  sky: { from: 'from-[color:var(--accent-sky)]/26', to: 'to-[color:var(--accent-lavender)]/12', fg: 'text-[color:var(--accent-sky)]' },
  lavender: { from: 'from-[color:var(--accent-lavender)]/28', to: 'to-[color:var(--accent-pink-2)]/12', fg: 'text-[color:var(--accent-lavender)]' },
  mint: { from: 'from-[color:var(--accent-mint)]/24', to: 'to-[color:var(--accent-sky)]/12', fg: 'text-[color:var(--accent-mint)]' }
};

export default function HomeActionGrid() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      reducedMotionRef.current = media.matches;
    };

    syncMotionPreference();
    media.addEventListener('change', syncMotionPreference);

    return () => media.removeEventListener('change', syncMotionPreference);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reducedMotionRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-home-action-card]',
        { autoAlpha: 0, y: 18, scale: 0.98 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          stagger: 0.06,
          ease: 'power3.out'
        }
      );

      gsap.fromTo(
        '[data-home-action-icon]',
        { y: 10, rotate: -8, autoAlpha: 0 },
        {
          y: 0,
          rotate: 0,
          autoAlpha: 1,
          duration: 0.48,
          stagger: 0.06,
          delay: 0.08,
          ease: 'power2.out'
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || reducedMotionRef.current) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>('[data-home-action-card]');
      const icons = gsap.utils.toArray<HTMLElement>('[data-home-action-icon]');

      cards.forEach((card, idx) => {
        gsap.to(card, {
          y: -10 - idx * 2,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.8
          }
        });
      });

      if (icons.length > 0) {
        gsap.to(icons, {
          yPercent: -16,
          rotate: 3,
          ease: 'none',
          stagger: 0.05,
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.9
          }
        });
      }
    }, section);

    return () => ctx.revert();
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (reducedMotionRef.current) return;

    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;

    gsap.to(card, {
      rotateY: relX * 6,
      rotateX: relY * -6,
      y: -2,
      duration: 0.24,
      ease: 'power2.out',
      transformPerspective: 900,
      overwrite: 'auto'
    });
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    gsap.to(event.currentTarget, {
      rotateY: 0,
      rotateX: 0,
      y: 0,
      duration: 0.32,
      ease: 'power3.out',
      overwrite: 'auto'
    });
  };

  return (
    <section ref={sectionRef} className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((it, idx) => {
        const Icon = it.icon;
        const tint = TINT[it.tint];
        return (
        <m.div
          key={it.href}
          data-home-action-card
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.03 * idx }}
        >
          <Link
            href={it.href}
            className="group relative block overflow-hidden rounded-3xl card-glass p-5"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div
              data-home-action-icon
              className={`absolute right-4 top-4 grid h-14 w-14 place-items-center rounded-2xl border border-[color:var(--border)] bg-gradient-to-br ${tint.from} ${tint.to} shadow-sm transition-transform duration-300 group-hover:scale-105`}
              aria-hidden="true"
            >
              <Icon className={`h-6 w-6 ${tint.fg}`} />
            </div>
            <div className="pr-20">
              <div className="text-base font-semibold font-bangul text-[color:var(--fg)]">{it.title}</div>
              <div className="mt-1 text-sm muted">{it.desc}</div>
              <div className="mt-3 text-xs font-semibold text-[color:var(--fg)]/80 group-hover:translate-x-0.5 transition-transform">
                열기 →
              </div>
            </div>
          </Link>
        </m.div>
        );
      })}
    </section>
  );
}
