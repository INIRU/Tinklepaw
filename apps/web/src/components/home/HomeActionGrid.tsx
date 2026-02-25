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

/* Richer gradient backgrounds per tint */
const TINT: Record<
  Item['tint'],
  {
    cardFrom: string;
    cardTo: string;
    iconBg: string;
    iconGlow: string;
    fg: string;
    accent: string;
    dot1: string;
    dot2: string;
    hoverBorder: string;
    hoverShadow: string;
  }
> = {
  pink: {
    cardFrom: 'from-[color:var(--accent-pink)]/14',
    cardTo: 'to-[color:var(--accent-pink-2)]/6',
    iconBg: 'from-[color:var(--accent-pink)]/35 to-[color:var(--accent-pink-2)]/20',
    iconGlow: 'shadow-[0_0_18px_rgba(255,95,162,0.32)]',
    fg: 'text-[color:var(--accent-pink)]',
    accent: 'var(--accent-pink)',
    dot1: 'bg-[color:var(--accent-pink)]/25',
    dot2: 'bg-[color:var(--accent-pink-2)]/18',
    hoverBorder: 'hover:border-[color:var(--accent-pink)]/35',
    hoverShadow: 'hover:shadow-[0_12px_32px_rgba(255,95,162,0.16)]'
  },
  sky: {
    cardFrom: 'from-[color:var(--accent-sky)]/13',
    cardTo: 'to-[color:var(--accent-lavender)]/6',
    iconBg: 'from-[color:var(--accent-sky)]/35 to-[color:var(--accent-lavender)]/20',
    iconGlow: 'shadow-[0_0_18px_rgba(120,183,255,0.30)]',
    fg: 'text-[color:var(--accent-sky)]',
    accent: 'var(--accent-sky)',
    dot1: 'bg-[color:var(--accent-sky)]/22',
    dot2: 'bg-[color:var(--accent-lavender)]/16',
    hoverBorder: 'hover:border-[color:var(--accent-sky)]/35',
    hoverShadow: 'hover:shadow-[0_12px_32px_rgba(120,183,255,0.14)]'
  },
  lavender: {
    cardFrom: 'from-[color:var(--accent-lavender)]/14',
    cardTo: 'to-[color:var(--accent-pink-2)]/6',
    iconBg: 'from-[color:var(--accent-lavender)]/35 to-[color:var(--accent-pink-2)]/20',
    iconGlow: 'shadow-[0_0_18px_rgba(188,167,255,0.32)]',
    fg: 'text-[color:var(--accent-lavender)]',
    accent: 'var(--accent-lavender)',
    dot1: 'bg-[color:var(--accent-lavender)]/22',
    dot2: 'bg-[color:var(--accent-pink-2)]/16',
    hoverBorder: 'hover:border-[color:var(--accent-lavender)]/35',
    hoverShadow: 'hover:shadow-[0_12px_32px_rgba(188,167,255,0.14)]'
  },
  mint: {
    cardFrom: 'from-[color:var(--accent-mint)]/12',
    cardTo: 'to-[color:var(--accent-sky)]/6',
    iconBg: 'from-[color:var(--accent-mint)]/35 to-[color:var(--accent-sky)]/20',
    iconGlow: 'shadow-[0_0_18px_rgba(57,211,179,0.28)]',
    fg: 'text-[color:var(--accent-mint)]',
    accent: 'var(--accent-mint)',
    dot1: 'bg-[color:var(--accent-mint)]/20',
    dot2: 'bg-[color:var(--accent-sky)]/14',
    hoverBorder: 'hover:border-[color:var(--accent-mint)]/32',
    hoverShadow: 'hover:shadow-[0_12px_32px_rgba(57,211,179,0.13)]'
  }
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
              className={`
                group relative block overflow-hidden rounded-3xl card-glass p-5
                border border-[color:var(--border)] transition-[border-color,box-shadow] duration-200
                ${tint.hoverBorder} ${tint.hoverShadow}
              `}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Card tint gradient overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${tint.cardFrom} ${tint.cardTo} opacity-80 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-3xl`} />

              {/* Shimmer sweep on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/6 to-transparent -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none rounded-3xl" />

              {/* Decorative floating dots */}
              <div
                className={`absolute bottom-4 left-4 h-12 w-12 rounded-full ${tint.dot1} blur-xl pointer-events-none`}
                aria-hidden="true"
              />
              <div
                className={`absolute top-8 right-20 h-8 w-8 rounded-full ${tint.dot2} blur-lg pointer-events-none`}
                aria-hidden="true"
              />

              {/* Icon — larger, with glow. Scale handled via group-hover:scale-110 (standard Tailwind value). */}
              <div
                data-home-action-icon
                className={`
                  absolute right-4 top-4
                  grid h-14 w-14 place-items-center rounded-2xl
                  border border-[color:var(--border)]
                  bg-gradient-to-br ${tint.iconBg}
                  ${tint.iconGlow}
                  transition-transform duration-200
                  group-hover:scale-110
                `}
                aria-hidden="true"
              >
                <Icon className={`h-7 w-7 ${tint.fg} drop-shadow-sm`} />
              </div>

              {/* Text content */}
              <div className="relative pr-20">
                <div className="text-base font-semibold font-bangul text-[color:var(--fg)]">{it.title}</div>
                <div className="mt-1 text-sm muted leading-snug">{it.desc}</div>

                {/* Arrow indicator */}
                <div className="mt-3 home-action-arrow text-xs font-bold" style={{ color: 'color-mix(in srgb, var(--fg) 70%, transparent)' }}>
                  <span>열기</span>
                  <span className="inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
                </div>
              </div>
            </Link>
          </m.div>
        );
      })}
    </section>
  );
}
