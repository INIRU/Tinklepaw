'use client';

import Link from 'next/link';
import { m } from 'framer-motion';
import type { ComponentType } from 'react';
import { Dices, Package, MessageCircle, User } from 'lucide-react';

type Item = {
  title: string;
  desc: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tint: 'pink' | 'sky' | 'lavender' | 'mint';
};

const items: Item[] = [
  { title: '뽑기', desc: '멋진 연출과 함께 역할 아이템을 뽑아봐', href: '/draw', icon: Dices, tint: 'pink' },
  { title: '인벤토리', desc: '보유/장착 상태 확인', href: '/inventory', icon: Package, tint: 'lavender' },
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
  return (
    <section className="mt-4 grid gap-3 sm:grid-cols-2">
      {items.map((it, idx) => {
        const Icon = it.icon;
        const tint = TINT[it.tint];
        return (
        <m.div
          key={it.href}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.03 * idx }}
        >
          <Link
            href={it.href}
            className="group relative block overflow-hidden rounded-3xl card-glass p-5"
          >
            <div
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
