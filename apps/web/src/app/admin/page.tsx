import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  ChartColumnBig,
  ChevronRight,
  Dices,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react';

import { fetchGuildMember, isAdmin } from '@/lib/server/discord';
import { requireAdmin } from '@/lib/server/guards';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import MotionIn from '@/components/motion/MotionIn';

const DEFAULT_STATUS_INTERVAL_MS = 10 * 60 * 1000;
const MIN_STATUS_INTERVAL_MS = 10 * 60 * 1000;
const POINT_BALANCE_PAGE_SIZE = 1000;
const MAX_POINT_BALANCE_PAGES = 50;
const ADMIN_CHECK_BATCH_SIZE = 20;

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

function resolveServiceState(status: string | null, sampledAt: string | null, nowMs: number, staleThresholdMs: number) {
  const normalized = String(status ?? '').toLowerCase();
  const sampledAtMs = sampledAt ? Date.parse(sampledAt) : Number.NaN;
  const isStale = !Number.isFinite(sampledAtMs) || nowMs - sampledAtMs > staleThresholdMs;

  if (isStale) {
    return {
      label: '신호 지연',
      toneClass: 'text-amber-500',
      dotClass: 'bg-amber-400'
    };
  }
  if (normalized === 'operational') {
    return {
      label: '정상',
      toneClass: 'text-emerald-500',
      dotClass: 'bg-emerald-400'
    };
  }
  if (normalized === 'degraded') {
    return {
      label: '지연',
      toneClass: 'text-amber-500',
      dotClass: 'bg-amber-400'
    };
  }
  if (normalized === 'unknown') {
    return {
      label: '확인 필요',
      toneClass: 'text-[color:var(--muted)]',
      dotClass: 'bg-[color:var(--muted)]/50'
    };
  }
  if (SERVICE_OK_HINTS.some((hint) => normalized.includes(hint))) {
    return {
      label: '정상',
      toneClass: 'text-emerald-500',
      dotClass: 'bg-emerald-400'
    };
  }
  if (SERVICE_DOWN_HINTS.some((hint) => normalized.includes(hint))) {
    return {
      label: '오프라인',
      toneClass: 'text-rose-500',
      dotClass: 'bg-rose-400'
    };
  }
  return {
    label: status ? '확인 필요' : '기록 없음',
    toneClass: 'text-[color:var(--muted)]',
    dotClass: 'bg-[color:var(--muted)]/50'
  };
}

export default async function AdminHome() {
  await requireAdmin();

  const supabase = createSupabaseAdminClient();
  const nowMs = Date.now();
  const oneDayAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const fetchAllPointBalances = async () => {
    const rows: Array<{ discord_user_id: string; balance: number }> = [];

    for (let page = 0; page < MAX_POINT_BALANCE_PAGES; page += 1) {
      const from = page * POINT_BALANCE_PAGE_SIZE;
      const to = from + POINT_BALANCE_PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from('point_balances')
        .select('discord_user_id, balance')
        .order('discord_user_id', { ascending: true })
        .range(from, to);

      if (error) {
        return {
          rows: [] as Array<{ discord_user_id: string; balance: number }>,
          error,
          truncated: false
        };
      }

      const chunk = data ?? [];
      rows.push(...chunk);

      if (chunk.length < POINT_BALANCE_PAGE_SIZE) {
        return {
          rows,
          error: null,
          truncated: false
        };
      }
    }

    return {
      rows,
      error: null,
      truncated: true
    };
  };

  const resolveAdminUserIds = async (userIds: string[]) => {
    const adminUserIds = new Set<string>();
    let failed = false;

    for (let i = 0; i < userIds.length; i += ADMIN_CHECK_BATCH_SIZE) {
      const batch = userIds.slice(i, i + ADMIN_CHECK_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (userId) => {
          try {
            const member = await fetchGuildMember({ userId });
            if (!member) return null;
            return (await isAdmin({ userId, member })) ? userId : null;
          } catch {
            failed = true;
            return null;
          }
        })
      );

      for (const id of results) {
        if (id) adminUserIds.add(id);
      }
    }

    return { adminUserIds, failed };
  };

  const [statusResult, pointEvents24hResult, latestPointEventResult, totalUsersResult, activeUsers24hResult, botConfigResult, pointBalancesResult] = await Promise.all([
    supabase
      .from('status_samples')
      .select('service, status, created_at')
      .in('service', ['bot', 'lavalink'])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('point_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', oneDayAgoIso),
    supabase
      .from('point_events')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('users').select('discord_user_id', { count: 'exact', head: true }),
    supabase.from('users').select('discord_user_id', { count: 'exact', head: true }).gte('last_seen_at', oneDayAgoIso),
    supabase.from('app_config').select('bot_sync_interval_ms').eq('id', 1).maybeSingle(),
    fetchAllPointBalances()
  ]);

  if (statusResult.error) {
    console.error('[AdminHome] failed to load status samples:', statusResult.error.message);
  }
  if (pointEvents24hResult.error) {
    console.error('[AdminHome] failed to load point event count:', pointEvents24hResult.error.message);
  }
  if (latestPointEventResult.error) {
    console.error('[AdminHome] failed to load latest point event:', latestPointEventResult.error.message);
  }
  if (totalUsersResult.error) {
    console.error('[AdminHome] failed to load total users count:', totalUsersResult.error.message);
  }
  if (activeUsers24hResult.error) {
    console.error('[AdminHome] failed to load active users count:', activeUsers24hResult.error.message);
  }
  if (botConfigResult.error) {
    console.error('[AdminHome] failed to load bot config:', botConfigResult.error.message);
  }
  if (pointBalancesResult.error) {
    console.error('[AdminHome] failed to load point balances:', pointBalancesResult.error.message);
  }
  if (pointBalancesResult.truncated) {
    console.error('[AdminHome] point balance pagination exceeded max pages; average may be incomplete');
  }

  const configuredStatusIntervalMs = Number(botConfigResult.data?.bot_sync_interval_ms ?? Number.NaN);
  const statusIntervalMs = Number.isFinite(configuredStatusIntervalMs) && configuredStatusIntervalMs > 0
    ? Math.max(configuredStatusIntervalMs, MIN_STATUS_INTERVAL_MS)
    : DEFAULT_STATUS_INTERVAL_MS;
  const staleThresholdMs = statusIntervalMs * 2;
  const statusIntervalLabel = `${Math.round(statusIntervalMs / 60_000)}분 주기`;

  const statusRows = statusResult.data ?? [];
  const botSample = statusRows.find((row) => row.service === 'bot') ?? null;
  const lavalinkSample = statusRows.find((row) => row.service === 'lavalink') ?? null;

  const botState = resolveServiceState(botSample?.status ?? null, botSample?.created_at ?? null, nowMs, staleThresholdMs);
  const lavalinkState = resolveServiceState(lavalinkSample?.status ?? null, lavalinkSample?.created_at ?? null, nowMs, staleThresholdMs);

  const pointEvents24hCount = pointEvents24hResult.error ? null : pointEvents24hResult.count ?? 0;
  const latestPointEventAt = latestPointEventResult.error ? null : latestPointEventResult.data?.created_at ?? null;
  const totalUsersCount = totalUsersResult.error ? null : totalUsersResult.count ?? 0;
  const activeUsers24hCount = activeUsers24hResult.error ? null : activeUsers24hResult.count ?? 0;

  let nonAdminAvgPoints: number | null = null;
  let nonAdminAvgSampleCount = 0;
  let nonAdminAvgError = false;

  if (!pointBalancesResult.error) {
    try {
      const userIds = pointBalancesResult.rows.map((row) => row.discord_user_id);
      const { adminUserIds, failed } = await resolveAdminUserIds(userIds);
      if (failed) nonAdminAvgError = true;

      let sum = 0;
      let count = 0;
      for (const row of pointBalancesResult.rows) {
        if (adminUserIds.has(row.discord_user_id)) continue;
        sum += Number(row.balance ?? 0);
        count += 1;
      }

      nonAdminAvgSampleCount = count;
      nonAdminAvgPoints = count > 0 ? sum / count : 0;
    } catch (error) {
      nonAdminAvgError = true;
      console.error('[AdminHome] failed to calculate non-admin average points:', error);
    }
  } else {
    nonAdminAvgError = true;
  }

  if (pointBalancesResult.truncated) {
    nonAdminAvgError = true;
  }

  const hasWidgetError = Boolean(
    statusResult.error ||
    pointEvents24hResult.error ||
    latestPointEventResult.error ||
    totalUsersResult.error ||
    activeUsers24hResult.error ||
    botConfigResult.error ||
    nonAdminAvgError
  );

  const numberFormatter = new Intl.NumberFormat('ko-KR');

  const operationWidgets = [
    {
      key: 'bot',
      title: 'BOT 상태',
      value: botState.label,
      meta: `마지막 신호 ${formatRelativeTime(botSample?.created_at ?? null)} · ${statusIntervalLabel}`,
      toneClass: botState.toneClass,
      dotClass: botState.dotClass
    },
    {
      key: 'lavalink',
      title: 'LAVALINK 상태',
      value: lavalinkState.label,
      meta: `마지막 신호 ${formatRelativeTime(lavalinkSample?.created_at ?? null)} · ${statusIntervalLabel}`,
      toneClass: lavalinkState.toneClass,
      dotClass: lavalinkState.dotClass
    },
    {
      key: 'events',
      title: '포인트 이벤트(24h)',
      value: pointEvents24hCount == null ? '집계 실패' : `${numberFormatter.format(pointEvents24hCount)}건`,
      meta: `최신 이벤트 ${formatRelativeTime(latestPointEventAt)}`,
      toneClass: 'text-[color:var(--fg)]',
      dotClass: 'bg-[color:var(--accent-sky)]/80'
    },
    {
      key: 'active-users',
      title: '활성 유저(24h)',
      value:
        activeUsers24hCount == null || totalUsersCount == null
          ? '집계 실패'
          : `${numberFormatter.format(activeUsers24hCount)} / ${numberFormatter.format(totalUsersCount)}`,
      meta: '활성 / 전체 유저',
      toneClass: 'text-[color:var(--fg)]',
      dotClass: 'bg-[color:var(--accent-pink)]/80'
    },
    {
      key: 'avg-points-non-admin',
      title: '일반 유저 평균 포인트',
      value: nonAdminAvgPoints == null ? '집계 실패' : `${numberFormatter.format(Math.round(nonAdminAvgPoints))}P`,
      meta: nonAdminAvgPoints == null ? '관리자 권한 유저 제외' : `관리자 권한 유저 제외 · ${numberFormatter.format(nonAdminAvgSampleCount)}명`,
      toneClass: 'text-[color:var(--fg)]',
      dotClass: 'bg-[color:var(--accent-mint)]/80'
    }
  ];

  const sections = [
    {
      title: '설정',
      desc: '입장 메시지, 채팅 보상, 채널 설정',
      href: '/admin/settings',
      icon: Settings,
      color: 'pink',
      focus: true
    },
    {
      title: '가챠',
      desc: '아이템/역할 매핑, 풀, 가중치',
      href: '/admin/gacha',
      icon: Dices,
      color: 'sky',
      focus: true
    },
    {
      title: '봇 설정',
      desc: '페르소나, 채팅 보상 알림',
      href: '/admin/bot',
      icon: Bot,
      color: 'mint',
      focus: false
    },
    {
      title: '유저',
      desc: '포인트/인벤/장착 상태 조정',
      href: '/admin/users',
      icon: Users,
      color: 'lavender',
      focus: true
    },
    {
      title: '알림 관리',
      desc: '공지 발송 및 보상 지급',
      href: '/admin/notifications',
      icon: Bell,
      color: 'yellow',
      focus: false
    },
    {
      title: '활동 통계',
      desc: '입장/이탈, 채팅, 통화 사용량 분석',
      href: '/admin/analytics',
      icon: ChartColumnBig,
      color: 'mint',
      focus: false
    }
  ];

  const COLOR_MAP = {
    pink: 'from-[color:var(--accent-pink)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-pink)]',
    sky: 'from-[color:var(--accent-sky)]/20 to-[color:var(--accent-lavender)]/10 text-[color:var(--accent-sky)]',
    lavender: 'from-[color:var(--accent-lavender)]/20 to-[color:var(--accent-pink-2)]/10 text-[color:var(--accent-lavender)]',
    mint: 'from-[color:var(--accent-mint)]/20 to-[color:var(--accent-sky)]/10 text-[color:var(--accent-mint)]',
    yellow: 'from-yellow-500/20 to-orange-500/10 text-yellow-600 dark:text-yellow-400'
  };

  const focusSections = sections.filter((it) => it.focus);

  const checklist = [
    '설정 탭에서 오늘 운영값(보상/주식/복권) 먼저 확인',
    '가챠 탭에서 활성 아이템/풀 구성 점검',
    '유저 탭에서 문의 대상 포인트/인벤 상태 보정',
    '알림 관리에서 오늘 공지/보상 전송 내역 확인'
  ];

  return (
    <main className="p-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-8">
        <MotionIn delay={0.05}>
          <section className="relative overflow-hidden rounded-[30px] card-glass p-6 sm:p-8">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1200px_400px_at_90%_0%,rgba(255,107,157,0.20),transparent_58%)]" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[color:var(--accent-sky)]/12 blur-3xl" />

            <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-pink)] opacity-80">ADMIN PANEL</div>
            <h1 className="mt-3 text-4xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">관리자 홈</h1>
            <p className="mt-2 max-w-2xl text-sm muted">자주 쓰는 운영 도구를 먼저 배치했습니다. 빠른 점검 후 상세 메뉴로 바로 이동하세요.</p>

            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">핵심 메뉴 {focusSections.length}개</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">전체 메뉴 {sections.length}개</span>
              <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/80 px-3 py-1">운영 모드</span>
            </div>
          </section>
        </MotionIn>

        <MotionIn delay={0.07}>
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-[color:var(--accent-sky)]" />
              <h2 className="text-sm font-semibold tracking-wide">운영 위젯</h2>
              <span className="text-xs muted">최근 운영 상태 요약</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {operationWidgets.map((widget) => (
                <article key={widget.key} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/88 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold tracking-[0.24em] muted-2">{widget.title}</div>
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${widget.dotClass}`} aria-hidden="true" />
                  </div>
                  <div className={`mt-2 text-xl font-bold ${widget.toneClass}`}>{widget.value}</div>
                  <div className="mt-1 text-xs muted">{widget.meta}</div>
                </article>
              ))}
            </div>
            {hasWidgetError ? <p className="mt-2 text-xs text-amber-600">일부 운영 지표를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p> : null}
          </section>
        </MotionIn>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <MotionIn delay={0.08}>
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[color:var(--accent-pink)]" />
                <h2 className="text-sm font-semibold tracking-wide">빠른 작업</h2>
              </div>
            </MotionIn>

            <div className="grid gap-4 sm:grid-cols-2">
              {focusSections.map((it, idx) => (
                <MotionIn key={it.href} delay={0.12 + idx * 0.05}>
                  <Link
                    className="group relative flex h-full items-start justify-between gap-4 overflow-hidden rounded-[26px] card-glass p-5 transition-all hover:scale-[1.01] hover:shadow-xl"
                    href={it.href}
                  >
                    <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-gradient-to-br ${COLOR_MAP[it.color as keyof typeof COLOR_MAP]} shadow-inner`}>
                        <it.icon className="h-5 w-5" strokeWidth={2} />
                      </div>
                      <div>
                        <div className="text-base font-bold text-[color:var(--fg)]">{it.title}</div>
                        <div className="mt-1 text-sm leading-relaxed muted">{it.desc}</div>
                      </div>
                    </div>

                    <ArrowUpRight className="h-5 w-5 text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={2.2} />
                  </Link>
                </MotionIn>
              ))}
            </div>
          </div>

          <MotionIn delay={0.1}>
            <aside className="rounded-[26px] border border-[color:var(--border)] bg-[color:var(--card)]/85 p-5">
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
            </aside>
          </MotionIn>
        </div>

        <MotionIn delay={0.15}>
          <div className="mb-3 flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-[color:var(--muted)]" />
            <h2 className="text-sm font-semibold tracking-wide">전체 메뉴</h2>
          </div>
        </MotionIn>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((it, idx) => (
            <MotionIn key={`all-${it.href}`} delay={0.18 + idx * 0.04}>
              <Link
                className="group relative flex h-full items-start justify-between gap-3 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/85 p-4 transition-all hover:border-[color:var(--fg)]/22 hover:shadow-lg"
                href={it.href}
              >
                <div className="flex items-start gap-4">
                  <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--border)] bg-gradient-to-br ${COLOR_MAP[it.color as keyof typeof COLOR_MAP]} shadow-inner`}>
                    <it.icon className="h-5 w-5" strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[color:var(--fg)]">{it.title}</div>
                    <div className="mt-1 text-xs leading-relaxed muted">{it.desc}</div>
                  </div>
                </div>

                <ChevronRight className="mt-1 h-4 w-4 text-[color:var(--muted)] transition-transform group-hover:translate-x-0.5" strokeWidth={2.4} />
              </Link>
            </MotionIn>
          ))}
        </div>
      </div>
    </main>
  );
}
