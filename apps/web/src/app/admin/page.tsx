import Link from 'next/link';
import { ChevronRight, Dices, Settings, Users, Bot, Bell, ChartColumnBig } from 'lucide-react';

import { requireAdmin } from '@/lib/server/guards';
import MotionIn from '@/components/motion/MotionIn';

export default async function AdminHome() {
  await requireAdmin();
  
  const sections = [
    {
      title: '설정',
      desc: '입장 메시지, 채팅 보상, 채널 설정',
      href: '/admin/settings',
      icon: Settings,
      color: 'pink'
    },
    {
      title: '가챠',
      desc: '아이템/역할 매핑, 풀, 가중치',
      href: '/admin/gacha',
      icon: Dices,
      color: 'sky'
    },
    {
      title: '봇 설정',
      desc: '페르소나, 채팅 보상 알림',
      href: '/admin/bot',
      icon: Bot,
      color: 'mint'
    },
    {
      title: '유저',
      desc: '포인트/인벤/장착 상태 조정',
      href: '/admin/users',
      icon: Users,
      color: 'lavender'
    },
    {
      title: '알림 관리',
      desc: '공지 발송 및 보상 지급',
      href: '/admin/notifications',
      icon: Bell,
      color: 'yellow'
    },
    {
      title: '활동 통계',
      desc: '입장/이탈, 채팅, 통화 사용량 분석',
      href: '/admin/analytics',
      icon: ChartColumnBig,
      color: 'mint'
    }
  ];

  const COLOR_MAP = {
    pink: 'from-[color:var(--accent-pink)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-pink)]',
    sky: 'from-[color:var(--accent-sky)]/20 to-[color:var(--accent-lavender)]/10 text-[color:var(--accent-sky)]',
    lavender: 'from-[color:var(--accent-lavender)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-lavender)]',
    mint: 'from-[color:var(--accent-mint)]/20 to-[color:var(--accent-sky)]/10 text-[color:var(--accent-mint)]',
    yellow: 'from-yellow-500/20 to-orange-500/10 text-yellow-600 dark:text-yellow-400'
  };

  return (
    <main className="p-6 pb-20">
      <div className="mx-auto max-w-4xl">
        <MotionIn delay={0.05}>
          <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-pink)] opacity-80">ADMIN PANEL</div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">관리자</h1>
          <p className="mt-2 text-sm muted">서버의 모든 설정과 데이터를 한곳에서 관리하세요.</p>
        </MotionIn>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {sections.map((it, idx) => (
            <MotionIn key={it.href} delay={0.1 + idx * 0.05}>
              <Link
                className="group relative flex h-full items-start justify-between gap-4 overflow-hidden rounded-[28px] card-glass p-6 transition-all hover:scale-[1.01] hover:shadow-xl"
                href={it.href}
              >
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-gradient-to-br ${COLOR_MAP[it.color as keyof typeof COLOR_MAP]} shadow-inner`}>
                    <it.icon className="h-6 w-6" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-base font-bold text-[color:var(--fg)]">{it.title}</div>
                    <div className="mt-1 text-sm muted leading-relaxed">{it.desc}</div>
                  </div>
                </div>
                
                <div className="flex h-12 items-center">
                  <div className="rounded-full bg-[color:var(--chip)] p-2 border border-[color:var(--border)] transition-transform group-hover:translate-x-1">
                    <ChevronRight className="h-4 w-4 text-[color:var(--muted)]" strokeWidth={2.5} />
                  </div>
                </div>
              </Link>
            </MotionIn>
          ))}
        </div>
      </div>
    </main>
  );
}
