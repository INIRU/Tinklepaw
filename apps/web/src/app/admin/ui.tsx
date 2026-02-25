'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  ChartColumnBig,
  ChevronRight,
  Dices,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { m } from 'framer-motion';

type DashboardData = {
  bot: { status: string | null; sampledAt: string | null };
  lavalink: { status: string | null; sampledAt: string | null };
  statusIntervalMs: number;
  pointEvents24h: number | null;
  latestPointEventAt: string | null;
  totalUsers: number | null;
  activeUsers24h: number | null;
  avgPoints: number | null;
  avgSampleCount: number;
};

const SERVICE_OK_HINTS = ['up', 'ok', 'online', 'healthy'];
const SERVICE_DOWN_HINTS = ['down', 'offline', 'error', 'fail'];

function formatRelativeTime(input: string | null) {
  if (!input) return '기록 없음';
  const atMs = Date.parse(input);
  if (!Number.isFinite(atMs)) return '기록 없음';
  const diffMs = Date.now() - atMs;
  if (diffMs < 60_000) return '방금 전';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}분 전`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}시간 전`;
  return `${Math.floor(diffMs / 86_400_000)}일 전`;
}

function resolveServiceState(
  status: string | null,
  sampledAt: string | null,
  nowMs: number,
  staleThresholdMs: number,
) {
  const normalized = String(status ?? '').toLowerCase();
  const sampledAtMs = sampledAt ? Date.parse(sampledAt) : Number.NaN;
  const isStale = !Number.isFinite(sampledAtMs) || nowMs - sampledAtMs > staleThresholdMs;

  if (isStale)
    return { label: '신호 지연', toneClass: 'text-amber-500', dotClass: 'bg-amber-400' };
  if (normalized === 'operational')
    return { label: '정상', toneClass: 'text-emerald-500', dotClass: 'bg-emerald-400' };
  if (normalized === 'degraded')
    return { label: '지연', toneClass: 'text-amber-500', dotClass: 'bg-amber-400' };
  if (normalized === 'unknown')
    return { label: '확인 필요', toneClass: 'text-[color:var(--muted)]', dotClass: 'bg-[color:var(--muted)]/50' };
  if (SERVICE_OK_HINTS.some((h) => normalized.includes(h)))
    return { label: '정상', toneClass: 'text-emerald-500', dotClass: 'bg-emerald-400' };
  if (SERVICE_DOWN_HINTS.some((h) => normalized.includes(h)))
    return { label: '오프라인', toneClass: 'text-rose-500', dotClass: 'bg-rose-400' };
  return {
    label: status ? '확인 필요' : '기록 없음',
    toneClass: 'text-[color:var(--muted)]',
    dotClass: 'bg-[color:var(--muted)]/50',
  };
}

const numberFormatter = new Intl.NumberFormat('ko-KR');

const sections = [
  { title: '설정', desc: '입장 메시지, 채팅 보상, 채널 설정', href: '/admin/settings', icon: Settings, color: 'pink', focus: true },
  { title: '가챠', desc: '아이템/역할 매핑, 풀, 가중치', href: '/admin/gacha', icon: Dices, color: 'sky', focus: true },
  { title: '봇 설정', desc: '페르소나, 채팅 보상 알림', href: '/admin/bot', icon: Bot, color: 'mint', focus: false },
  { title: '유저', desc: '포인트/인벤/장착 상태 조정', href: '/admin/users', icon: Users, color: 'lavender', focus: true },
  { title: '알림 관리', desc: '공지 발송 및 보상 지급', href: '/admin/notifications', icon: Bell, color: 'yellow', focus: false },
  { title: '활동 통계', desc: '입장/이탈, 채팅, 통화 사용량 분석', href: '/admin/analytics', icon: ChartColumnBig, color: 'mint', focus: false },
] as const;

const COLOR_MAP: Record<string, string> = {
  pink: 'from-[color:var(--accent-pink)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-pink)]',
  sky: 'from-[color:var(--accent-sky)]/20 to-[color:var(--accent-lavender)]/10 text-[color:var(--accent-sky)]',
  lavender: 'from-[color:var(--accent-lavender)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-lavender)]',
  mint: 'from-[color:var(--accent-mint)]/20 to-[color:var(--accent-sky)]/10 text-[color:var(--accent-mint)]',
  yellow: 'from-yellow-500/20 to-orange-500/10 text-yellow-600 dark:text-yellow-400',
};

const focusSections = sections.filter((it) => it.focus);

const checklist = [
  '설정 탭에서 오늘 운영값(보상/주식/복권) 먼저 확인',
  '가챠 탭에서 활성 아이템/풀 구성 점검',
  '유저 탭에서 문의 대상 포인트/인벤 상태 보정',
  '알림 관리에서 오늘 공지/보상 전송 내역 확인',
];

function WidgetSkeleton() {
  return (
    <article className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4 animate-pulse">
      <div className="flex items-center justify-between gap-2">
        <div className="h-3 w-20 rounded bg-[color:var(--chip)]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[color:var(--chip)]" />
      </div>
      <div className="mt-3 h-6 w-24 rounded bg-[color:var(--chip)]" />
      <div className="mt-2 h-3 w-32 rounded bg-[color:var(--chip)]" />
    </article>
  );
}

const motionProps = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.35 as const },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

export default function AdminDashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const nowMs = Date.now();
  const staleThresholdMs = (data?.statusIntervalMs ?? 600_000) * 2;
  const statusIntervalLabel = data ? `${Math.round(data.statusIntervalMs / 60_000)}분 주기` : '';

  const botState = data
    ? resolveServiceState(data.bot.status, data.bot.sampledAt, nowMs, staleThresholdMs)
    : null;
  const lavalinkState = data
    ? resolveServiceState(data.lavalink.status, data.lavalink.sampledAt, nowMs, staleThresholdMs)
    : null;

  const widgets = data
    ? [
        {
          key: 'bot',
          title: 'BOT 상태',
          value: botState!.label,
          meta: `마지막 신호 ${formatRelativeTime(data.bot.sampledAt)} · ${statusIntervalLabel}`,
          toneClass: botState!.toneClass,
          dotClass: botState!.dotClass,
        },
        {
          key: 'lavalink',
          title: 'LAVALINK 상태',
          value: lavalinkState!.label,
          meta: `마지막 신호 ${formatRelativeTime(data.lavalink.sampledAt)} · ${statusIntervalLabel}`,
          toneClass: lavalinkState!.toneClass,
          dotClass: lavalinkState!.dotClass,
        },
        {
          key: 'events',
          title: '포인트 이벤트(24h)',
          value: data.pointEvents24h == null ? '집계 실패' : `${numberFormatter.format(data.pointEvents24h)}건`,
          meta: `최신 이벤트 ${formatRelativeTime(data.latestPointEventAt)}`,
          toneClass: 'text-[color:var(--fg)]',
          dotClass: 'bg-[color:var(--accent-sky)]/80',
        },
        {
          key: 'active-users',
          title: '활성 유저(24h)',
          value:
            data.activeUsers24h == null || data.totalUsers == null
              ? '집계 실패'
              : `${numberFormatter.format(data.activeUsers24h)} / ${numberFormatter.format(data.totalUsers)}`,
          meta: '활성 / 전체 유저',
          toneClass: 'text-[color:var(--fg)]',
          dotClass: 'bg-[color:var(--accent-pink)]/80',
        },
        {
          key: 'avg-points',
          title: '평균 포인트',
          value: data.avgPoints == null ? '집계 실패' : `${numberFormatter.format(Math.round(data.avgPoints))}P`,
          meta: data.avgPoints == null ? '전체 유저 기준' : `전체 유저 기준 · ${numberFormatter.format(data.avgSampleCount)}명`,
          toneClass: 'text-[color:var(--fg)]',
          dotClass: 'bg-[color:var(--accent-mint)]/80',
        },
      ]
    : null;

  return (
    <main className="p-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Hero */}
        <m.section {...motionProps} className="relative overflow-hidden rounded-[30px] card-glass p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_400px_at_90%_0%,rgba(255,107,157,0.20),transparent_58%)]" />
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[color:var(--accent-sky)]/12 blur-3xl" />

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-pink)] opacity-80">ADMIN PANEL</div>
              <h1 className="mt-3 text-4xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">관리자 홈</h1>
              <p className="mt-2 max-w-2xl text-sm muted">자주 쓰는 운영 도구를 먼저 배치했습니다. 빠른 점검 후 상세 메뉴로 바로 이동하세요.</p>
            </div>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)]/75 px-3 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/80 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? '새로고침 중...' : '새로고침'}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">핵심 메뉴 {focusSections.length}개</span>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">전체 메뉴 {sections.length}개</span>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">운영 모드</span>
          </div>
        </m.section>

        {/* Operation Widgets */}
        <m.section {...motionProps} transition={{ ...motionProps.transition, delay: 0.05 }}>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[color:var(--accent-sky)]" />
            <h2 className="text-sm font-semibold tracking-wide">운영 위젯</h2>
            <span className="text-xs muted">최근 운영 상태 요약</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {loading && !widgets
              ? Array.from({ length: 5 }).map((_, i) => <WidgetSkeleton key={i} />)
              : widgets?.map((w) => (
                  <article key={w.key} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold tracking-[0.24em] muted-2">{w.title}</div>
                      <span className={`inline-flex h-2.5 w-2.5 rounded-full ${w.dotClass}`} aria-hidden="true" />
                    </div>
                    <div className={`mt-2 text-xl font-bold ${w.toneClass}`}>{w.value}</div>
                    <div className="mt-1 text-xs muted">{w.meta}</div>
                  </article>
                ))}
          </div>
        </m.section>

        {/* Quick Actions + Checklist */}
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <m.div {...motionProps} transition={{ ...motionProps.transition, delay: 0.08 }}>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[color:var(--accent-pink)]" />
                <h2 className="text-sm font-semibold tracking-wide">빠른 작업</h2>
              </div>
            </m.div>

            <div className="grid gap-4 sm:grid-cols-2">
              {focusSections.map((it, idx) => (
                <m.div key={it.href} {...motionProps} transition={{ ...motionProps.transition, delay: 0.12 + idx * 0.05 }}>
                  <Link
                    className="group relative flex h-full items-start justify-between gap-4 overflow-hidden rounded-[26px] card-glass p-5 transition-all hover:scale-[1.01] hover:shadow-xl"
                    href={it.href}
                  >
                    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-gradient-to-br ${COLOR_MAP[it.color]} shadow-inner`}>
                        <it.icon className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-base font-bold text-[color:var(--fg)]">{it.title}</div>
                        <div className="mt-1 text-sm leading-relaxed muted">{it.desc}</div>
                      </div>
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} />
                  </Link>
                </m.div>
              ))}
            </div>
          </div>

          <m.aside {...motionProps} transition={{ ...motionProps.transition, delay: 0.1 }} className="rounded-[26px] border border-[color:var(--border)] bg-[color:var(--card)]/85 p-5">
            <h3 className="text-sm font-semibold">운영 체크리스트</h3>
            <p className="mt-1 text-xs muted">교대/배포 전 빠르게 확인할 기본 항목</p>
            <div className="mt-4 space-y-2">
              {checklist.map((item, idx) => (
                <div key={item} className="flex items-start gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 px-3 py-2 text-xs">
                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-pink)]/18 text-[10px] font-semibold text-[color:var(--accent-pink)]">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed muted">{item}</span>
                </div>
              ))}
            </div>
          </m.aside>
        </div>

        {/* All Menus */}
        <m.div {...motionProps} transition={{ ...motionProps.transition, delay: 0.15 }}>
          <div className="mb-3 flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-[color:var(--muted)]" />
            <h2 className="text-sm font-semibold tracking-wide">전체 메뉴</h2>
          </div>
        </m.div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((it, idx) => (
            <m.div key={`all-${it.href}`} {...motionProps} transition={{ ...motionProps.transition, delay: 0.18 + idx * 0.04 }}>
              <Link
                className="group relative flex h-full items-start justify-between gap-3 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/85 p-4 transition-all hover:border-[color:var(--fg)]/22 hover:shadow-lg"
                href={it.href}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-gradient-to-br ${COLOR_MAP[it.color]} shadow-inner`}>
                    <it.icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[color:var(--fg)]">{it.title}</div>
                    <div className="mt-1 text-xs leading-relaxed muted">{it.desc}</div>
                  </div>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
              </Link>
            </m.div>
          ))}
        </div>
      </div>
    </main>
  );
}
