'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ChartColumnBig, MessageCircle, UserPlus, UserMinus, Phone } from 'lucide-react';

import { CustomSelect } from '@/components/ui/CustomSelect';

type Period = 'day' | 'week' | 'month';

type PeriodPoint = {
  key: string;
  label: string;
  joins: number;
  leaves: number;
  chatMessages: number;
  voiceHours: number;
  joinRatePct: number;
  churnRatePct: number;
};

type TopUser = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  chatMessages: number;
  voiceHours: number;
  joins: number;
  leaves: number;
  score: number;
};

type PeriodTotals = {
  joins: number;
  leaves: number;
  chatMessages: number;
  voiceHours: number;
};

type PeriodComparison = {
  joinsPct: number;
  leavesPct: number;
  chatMessagesPct: number;
  voiceHoursPct: number;
};

type EconomyKindTotal = {
  kind: string;
  issued: number;
  burned: number;
  net: number;
};

type EconomyCategoryTotal = {
  category: string;
  label: string;
  issued: number;
  burned: number;
  net: number;
  eventCount: number;
  kinds: string[];
};

type EconomyPoint = {
  key: string;
  label: string;
  issued: number;
  burned: number;
  net: number;
  cumulative: number;
  activeUsers: number;
  netMovingAvg7: number;
  netTrend: number;
};

type EconomyTotals = {
  issued: number;
  burned: number;
  net: number;
  cumulative: number;
  activeUsers: number;
};

type EconomyComparison = {
  issuedPct: number;
  burnedPct: number;
  netPct: number;
};

type EconomyPayload = {
  points: EconomyPoint[];
  totals: EconomyTotals;
  comparison: EconomyComparison;
  topSources: EconomyKindTotal[];
  topSinks: EconomyKindTotal[];
  sourceCategories: EconomyCategoryTotal[];
  sinkCategories: EconomyCategoryTotal[];
};

type PeriodPayload = {
  points: PeriodPoint[];
  topUsers: TopUser[];
  totals: PeriodTotals;
  comparison: PeriodComparison;
  economy: EconomyPayload;
};

type ChannelOption = {
  id: string;
  name: string;
};

type AnalyticsResponse = {
  generatedAt: string;
  filters: {
    rangeDays: number;
    channelId: string | null;
  };
  periods: Record<Period, PeriodPayload>;
};

type MetricKey = keyof Pick<PeriodPoint, 'joins' | 'leaves' | 'chatMessages' | 'voiceHours' | 'joinRatePct' | 'churnRatePct'>;
type EconomyMetricKey = keyof Pick<EconomyPoint, 'issued' | 'burned' | 'net' | 'cumulative' | 'activeUsers'>;

const PERIOD_LABEL: Record<Period, string> = {
  day: '일별',
  week: '주별',
  month: '월별'
};

const RANGE_OPTIONS = [
  { value: 30, label: '최근 30일' },
  { value: 90, label: '최근 90일' },
  { value: 365, label: '최근 1년' },
];

const METRICS: Array<{
  key: MetricKey;
  title: string;
  icon: typeof UserPlus;
  colorClass: string;
  format: (value: number) => string;
}> = [
  {
    key: 'joins',
    title: '입장 수',
    icon: UserPlus,
    colorClass: 'bg-emerald-400',
    format: (value) => `${value.toLocaleString()}명`
  },
  {
    key: 'leaves',
    title: '이탈 수',
    icon: UserMinus,
    colorClass: 'bg-rose-400',
    format: (value) => `${value.toLocaleString()}명`
  },
  {
    key: 'chatMessages',
    title: '채팅 수',
    icon: MessageCircle,
    colorClass: 'bg-sky-400',
    format: (value) => `${value.toLocaleString()}개`
  },
  {
    key: 'voiceHours',
    title: '통화 이용 시간',
    icon: Phone,
    colorClass: 'bg-violet-400',
    format: (value) => `${value.toFixed(1)}시간`
  },
  {
    key: 'joinRatePct',
    title: '입장률',
    icon: ChartColumnBig,
    colorClass: 'bg-emerald-300',
    format: (value) => `${value.toFixed(1)}%`
  },
  {
    key: 'churnRatePct',
    title: '이탈율',
    icon: ChartColumnBig,
    colorClass: 'bg-amber-300',
    format: (value) => `${value.toFixed(1)}%`
  }
];

const ECONOMY_METRICS: Array<{
  key: EconomyMetricKey;
  title: string;
  icon: typeof UserPlus;
  colorClass: string;
  format: (value: number) => string;
}> = [
  {
    key: 'issued',
    title: '총 발행 p',
    icon: UserPlus,
    colorClass: 'bg-emerald-400',
    format: (value) => `+${value.toLocaleString()}p`
  },
  {
    key: 'burned',
    title: '총 소각 p',
    icon: UserMinus,
    colorClass: 'bg-rose-400',
    format: (value) => `-${value.toLocaleString()}p`
  },
  {
    key: 'net',
    title: '순증감 p',
    icon: ChartColumnBig,
    colorClass: 'bg-sky-400',
    format: (value) => `${value >= 0 ? '+' : ''}${value.toLocaleString()}p`
  },
  {
    key: 'cumulative',
    title: '누적 순증감 p',
    icon: ChartColumnBig,
    colorClass: 'bg-violet-400',
    format: (value) => `${value >= 0 ? '+' : ''}${value.toLocaleString()}p`
  },
  {
    key: 'activeUsers',
    title: '경제 활동 유저',
    icon: MessageCircle,
    colorClass: 'bg-amber-400',
    format: (value) => `${value.toLocaleString()}명`
  },
];

function MetricChart({
  title,
  icon: Icon,
  points,
  metric,
  colorClass,
  formatter,
}: {
  title: string;
  icon: typeof UserPlus;
  points: PeriodPoint[];
  metric: MetricKey;
  colorClass: string;
  formatter: (value: number) => string;
}) {
  const values = points.map((point) => point[metric]);
  const max = Math.max(...values, 1);
  const latest = values.at(-1) ?? 0;

  return (
    <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="rounded-xl bg-[color:var(--chip)] p-2 border border-[color:var(--border)]">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="text-xs muted">최근 {formatter(latest)}</div>
      </div>

      <div className="h-36 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 px-2 py-2">
        <div className="flex h-full items-end gap-1">
          {points.map((point, index) => {
            const value = point[metric];
            const heightPercent = Math.max(4, (value / max) * 100);
            const showLabel = index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 4)) === 0;

            return (
              <div key={point.key} className="flex h-full min-w-0 flex-1 flex-col justify-end items-center gap-1">
                <div
                  title={`${point.label} · ${formatter(value)}`}
                  className={`w-full rounded-t-md ${colorClass}`}
                  style={{ height: `${heightPercent}%` }}
                />
                <div className="h-3 text-[10px] muted">{showLabel ? point.label : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EconomyMetricChart({
  title,
  icon: Icon,
  points,
  metric,
  colorClass,
  formatter,
}: {
  title: string;
  icon: typeof UserPlus;
  points: EconomyPoint[];
  metric: EconomyMetricKey;
  colorClass: string;
  formatter: (value: number) => string;
}) {
  const values = points.map((point) => point[metric]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(max - min, 1);
  const latest = values.at(-1) ?? 0;

  return (
    <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="rounded-xl bg-[color:var(--chip)] p-2 border border-[color:var(--border)]">
            <Icon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="text-xs muted">최근 {formatter(latest)}</div>
      </div>

      <div className="h-36 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 px-2 py-2">
        <div className="flex h-full items-end gap-1">
          {points.map((point, index) => {
            const value = point[metric];
            const normalized = ((value - min) / range) * 100;
            const heightPercent = Math.max(4, normalized);
            const showLabel = index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 4)) === 0;

            return (
              <div key={point.key} className="flex h-full min-w-0 flex-1 flex-col justify-end items-center gap-1">
                <div
                  title={`${point.label} · ${formatter(value)}`}
                  className={`w-full rounded-t-md ${colorClass}`}
                  style={{ height: `${heightPercent}%` }}
                />
                <div className="h-3 text-[10px] muted">{showLabel ? point.label : ''}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NetTrendChart({ points }: { points: EconomyPoint[] }) {
  const values = points.flatMap((point) => [point.net, point.netMovingAvg7, point.netTrend]);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(max - min, 1);
  const baseline = ((max - 0) / range) * 100;

  const toY = (value: number) => ((max - value) / range) * 100;
  const toX = (index: number) => (points.length <= 1 ? 0 : (index / (points.length - 1)) * 100);

  const netPath = points.map((point, index) => `${toX(index)},${toY(point.net)}`).join(' ');
  const movingPath = points.map((point, index) => `${toX(index)},${toY(point.netMovingAvg7)}`).join(' ');
  const trendPath = points.map((point, index) => `${toX(index)},${toY(point.netTrend)}`).join(' ');

  return (
    <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">순증감 추세 (7기간 이동평균 + 추세선)</h3>
          <p className="mt-1 text-xs muted">막대: 순증감 · 청록선: 7기간 이동평균 · 주황선: 선형 추세선</p>
        </div>
        <div className="text-xs muted">최근 {points.at(-1)?.net.toLocaleString() ?? 0}p</div>
      </div>

      <div className="relative h-48 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 px-2 py-2">
        <div className="absolute left-2 right-2 border-t border-dashed border-[color:var(--border)]/80" style={{ top: `${baseline}%` }} />

        <div className="absolute inset-0 px-2 py-2">
          <div className="flex h-full items-stretch gap-1">
            {points.map((point) => {
              const y = toY(point.net);
              const top = Math.min(y, baseline);
              const height = Math.max(Math.abs(y - baseline), 1.5);

              return (
                <div key={point.key} className="relative min-w-0 flex-1">
                  <div
                    title={`${point.label} · ${point.net >= 0 ? '+' : ''}${point.net.toLocaleString()}p`}
                    className={`absolute left-0 right-0 rounded-sm ${point.net >= 0 ? 'bg-emerald-400/75' : 'bg-rose-400/75'}`}
                    style={{ top: `${top}%`, height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <svg className="absolute inset-0 h-full w-full px-2 py-2" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polyline fill="none" stroke="rgba(125,211,252,0.95)" strokeWidth="1.2" points={netPath} />
          <polyline fill="none" stroke="rgba(45,212,191,0.95)" strokeWidth="1.4" points={movingPath} />
          <polyline fill="none" stroke="rgba(251,146,60,0.95)" strokeWidth="1.2" strokeDasharray="2 2" points={trendPath} />
        </svg>

        <div className="pointer-events-none absolute bottom-0 left-2 right-2 grid text-[10px] muted" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0,1fr))` }}>
          {points.map((point, index) => {
            const show = index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 4)) === 0;
            return (
              <div key={`${point.key}-label`} className="truncate text-center">
                {show ? point.label : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AdminAnalyticsClient() {
  const [period, setPeriod] = useState<Period>('day');
  const [rangeDays, setRangeDays] = useState(365);
  const [channelId, setChannelId] = useState('all');
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reloadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadChannels = async () => {
      try {
        const res = await fetch('/api/admin/discord/channels', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { channels?: ChannelOption[] } | null;
        if (!cancelled) {
          setChannels((body?.channels ?? []).map((channel) => ({ id: channel.id, name: channel.name })));
        }
      } catch {
        // ignore channel list failure
      }
    };

    void loadChannels();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeController: AbortController | null = null;

    const load = async (silent = false) => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('rangeDays', String(rangeDays));
        if (channelId !== 'all') {
          params.set('channelId', channelId);
        }

        const res = await fetch(`/api/admin/analytics?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? '통계를 불러오지 못했습니다.');
        }
        const body = (await res.json()) as AnalyticsResponse;
        if (!cancelled) setData(body);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!silent) {
          setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
        }
      } finally {
        if (cancelled) return;
        if (silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

    reloadRef.current = async () => {
      await load(true);
    };

    void load(false);

    return () => {
      cancelled = true;
      activeController?.abort();
    };
  }, [channelId, rangeDays]);

  const selected = useMemo(
    () =>
      data?.periods[period] ?? {
        points: [],
        topUsers: [],
        totals: { joins: 0, leaves: 0, chatMessages: 0, voiceHours: 0 },
        comparison: { joinsPct: 0, leavesPct: 0, chatMessagesPct: 0, voiceHoursPct: 0 },
        economy: {
          points: [],
          totals: { issued: 0, burned: 0, net: 0, cumulative: 0, activeUsers: 0 },
          comparison: { issuedPct: 0, burnedPct: 0, netPct: 0 },
          topSources: [],
          topSinks: [],
          sourceCategories: [],
          sinkCategories: [],
        },
      },
    [data, period]
  );

  return (
    <main className="p-6 pb-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold tracking-[0.3em] text-[color:var(--accent-mint)] opacity-80">ADMIN ANALYTICS</div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight font-bangul text-[color:var(--fg)]">활동 통계</h1>
            <p className="mt-2 text-sm muted">유저 입장/이탈, 채팅량, 통화 시간, 상위 활동 유저를 일/주/월 단위로 확인합니다.</p>
          </div>
          <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-2 text-sm hover:bg-[color:var(--chip)]/60">
            <ArrowLeft className="h-4 w-4" />
            관리자 홈
          </Link>
        </div>

        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold border ${
                  period === item
                    ? 'bg-[color:var(--accent-mint)]/20 border-[color:var(--accent-mint)] text-[color:var(--accent-mint)]'
                    : 'border-[color:var(--border)] hover:bg-[color:var(--chip)]/60'
                }`}
              >
                {PERIOD_LABEL[item]}
              </button>
            ))}

            <div className="ml-auto w-[170px]">
              <CustomSelect
                value={String(rangeDays)}
                onChange={(value) => setRangeDays(Number(value) || 365)}
                options={RANGE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))}
                label="기간"
              />
            </div>

            <div className="w-[200px]">
              <CustomSelect
                value={channelId}
                onChange={setChannelId}
                options={[{ value: 'all', label: '전체 채널' }, ...channels.map((channel) => ({ value: channel.id, label: `#${channel.name}` }))]}
                label="채널"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                void reloadRef.current?.();
              }}
              disabled={refreshing}
              className="inline-flex items-center justify-center rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]/60 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {refreshing ? '새로고침 중...' : '새로고침'}
            </button>

          </div>
          <div className="mt-3 text-xs muted">
            집계 단위: {PERIOD_LABEL[period]} · 채널: {channelId === 'all' ? '전체' : `#${channels.find((channel) => channel.id === channelId)?.name ?? channelId}`} · 마지막 업데이트:{' '}
            {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}
          </div>
        </div>

        {loading && !data ? (
          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center muted">통계를 불러오는 중...</div>
        ) : error && !data ? (
          <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-300">{error}</div>
        ) : (
          <>
            {error ? (
              <div className="rounded-2xl border border-amber-300/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                최신 통계 갱신 실패: {error}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 입장</div>
                <div className="mt-1 text-xl font-bold">{selected.totals.joins.toLocaleString()}명</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 이탈</div>
                <div className="mt-1 text-xl font-bold">{selected.totals.leaves.toLocaleString()}명</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 채팅</div>
                <div className="mt-1 text-xl font-bold">{selected.totals.chatMessages.toLocaleString()}개</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 통화 시간</div>
                <div className="mt-1 text-xl font-bold">{selected.totals.voiceHours.toFixed(1)}시간</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">입장 증감</div>
                <div className={`mt-1 text-lg font-semibold ${selected.comparison.joinsPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {selected.comparison.joinsPct >= 0 ? '+' : ''}
                  {selected.comparison.joinsPct.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">이탈 증감</div>
                <div className={`mt-1 text-lg font-semibold ${selected.comparison.leavesPct >= 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {selected.comparison.leavesPct >= 0 ? '+' : ''}
                  {selected.comparison.leavesPct.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">채팅 증감</div>
                <div className={`mt-1 text-lg font-semibold ${selected.comparison.chatMessagesPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {selected.comparison.chatMessagesPct >= 0 ? '+' : ''}
                  {selected.comparison.chatMessagesPct.toFixed(1)}%
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">통화 증감</div>
                <div className={`mt-1 text-lg font-semibold ${selected.comparison.voiceHoursPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {selected.comparison.voiceHoursPct >= 0 ? '+' : ''}
                  {selected.comparison.voiceHoursPct.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {METRICS.map((metric) => (
                <MetricChart
                  key={metric.key}
                  title={metric.title}
                  icon={metric.icon}
                  points={selected.points}
                  metric={metric.key}
                  colorClass={metric.colorClass}
                  formatter={metric.format}
                />
              ))}
            </div>

            <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold">경제 리포트</h2>
                <p className="mt-1 text-sm muted">포인트 발행/소각/순증감/누적 추이를 자동 집계합니다. (수동 새로고침)</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">총 발행 p</div>
                  <div className="mt-1 text-xl font-bold text-emerald-300">+{selected.economy.totals.issued.toLocaleString()}p</div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">총 소각 p</div>
                  <div className="mt-1 text-xl font-bold text-rose-300">-{selected.economy.totals.burned.toLocaleString()}p</div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">순증감 p</div>
                  <div className={`mt-1 text-xl font-bold ${selected.economy.totals.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selected.economy.totals.net >= 0 ? '+' : ''}
                    {selected.economy.totals.net.toLocaleString()}p
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">누적 순증감 p</div>
                  <div className={`mt-1 text-xl font-bold ${selected.economy.totals.cumulative >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selected.economy.totals.cumulative >= 0 ? '+' : ''}
                    {selected.economy.totals.cumulative.toLocaleString()}p
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">경제 활동 유저</div>
                  <div className="mt-1 text-xl font-bold">{selected.economy.totals.activeUsers.toLocaleString()}명</div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">발행 증감</div>
                  <div className={`mt-1 text-lg font-semibold ${selected.economy.comparison.issuedPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selected.economy.comparison.issuedPct >= 0 ? '+' : ''}
                    {selected.economy.comparison.issuedPct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">소각 증감</div>
                  <div className={`mt-1 text-lg font-semibold ${selected.economy.comparison.burnedPct >= 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {selected.economy.comparison.burnedPct >= 0 ? '+' : ''}
                    {selected.economy.comparison.burnedPct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-4">
                  <div className="text-xs uppercase tracking-[0.12em] muted">순증감 변동</div>
                  <div className={`mt-1 text-lg font-semibold ${selected.economy.comparison.netPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selected.economy.comparison.netPct >= 0 ? '+' : ''}
                    {selected.economy.comparison.netPct.toFixed(1)}%
                  </div>
                </div>
              </div>

              <NetTrendChart points={selected.economy.points} />

              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {ECONOMY_METRICS.map((metric) => (
                  <EconomyMetricChart
                    key={metric.key}
                    title={metric.title}
                    icon={metric.icon}
                    points={selected.economy.points}
                    metric={metric.key}
                    colorClass={metric.colorClass}
                    formatter={metric.format}
                  />
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/30 p-4">
                  <h3 className="text-sm font-semibold">발행 카테고리</h3>
                  <div className="mt-3 space-y-2">
                    {selected.economy.sourceCategories.length === 0 ? (
                      <div className="text-sm muted">발행 카테고리 데이터가 없습니다.</div>
                    ) : (
                      selected.economy.sourceCategories.map((category) => (
                        <div key={category.category} className="rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--surface)]/40 px-3 py-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold">{category.label}</span>
                            <span className="text-emerald-300">+{category.issued.toLocaleString()}p</span>
                          </div>
                          <div className="mt-1 text-xs muted font-mono break-all">{category.kinds.join(', ')}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/30 p-4">
                  <h3 className="text-sm font-semibold">소각 카테고리</h3>
                  <div className="mt-3 space-y-2">
                    {selected.economy.sinkCategories.length === 0 ? (
                      <div className="text-sm muted">소각 카테고리 데이터가 없습니다.</div>
                    ) : (
                      selected.economy.sinkCategories.map((category) => (
                        <div key={category.category} className="rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--surface)]/40 px-3 py-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-semibold">{category.label}</span>
                            <span className="text-rose-300">-{category.burned.toLocaleString()}p</span>
                          </div>
                          <div className="mt-1 text-xs muted font-mono break-all">{category.kinds.join(', ')}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/20 p-4">
                  <h3 className="text-sm font-semibold">세부 발행 이벤트 (kind)</h3>
                  <div className="mt-3 space-y-2">
                    {selected.economy.topSources.length === 0 ? (
                      <div className="text-sm muted">발행 이벤트가 없습니다.</div>
                    ) : (
                      selected.economy.topSources.map((source) => (
                        <div key={source.kind} className="flex items-center justify-between text-sm">
                          <span className="font-mono muted">{source.kind}</span>
                          <span className="text-emerald-300">+{source.issued.toLocaleString()}p</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/20 p-4">
                  <h3 className="text-sm font-semibold">세부 소각 이벤트 (kind)</h3>
                  <div className="mt-3 space-y-2">
                    {selected.economy.topSinks.length === 0 ? (
                      <div className="text-sm muted">소각 이벤트가 없습니다.</div>
                    ) : (
                      selected.economy.topSinks.map((sink) => (
                        <div key={sink.kind} className="flex items-center justify-between text-sm">
                          <span className="font-mono muted">{sink.kind}</span>
                          <span className="text-rose-300">-{sink.burned.toLocaleString()}p</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
              <h2 className="text-lg font-semibold">활동 상위 유저</h2>
              <p className="mt-1 text-sm muted">채팅 수 + 통화 분으로 계산한 활동 점수 기준입니다.</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.12em] muted border-b border-[color:var(--border)]">
                      <th className="py-2 pr-3">순위</th>
                      <th className="py-2 pr-3">유저</th>
                      <th className="py-2 pr-3">채팅</th>
                      <th className="py-2 pr-3">통화 시간</th>
                      <th className="py-2 pr-3">입장</th>
                      <th className="py-2 pr-3">퇴장</th>
                      <th className="py-2">점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.topUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center muted">집계된 활동 유저가 없습니다.</td>
                      </tr>
                    ) : (
                      selected.topUsers.map((user, index) => (
                        <tr key={user.userId} className="border-b border-[color:var(--border)]/60">
                          <td className="py-3 pr-3 font-semibold">#{index + 1}</td>
                          <td className="py-3 pr-3">
                            <div className="inline-flex items-center gap-2">
                              <span className="w-7 h-7 rounded-full overflow-hidden bg-[color:var(--chip)] border border-[color:var(--border)]">
                                {user.avatarUrl ? (
                                  <Image src={user.avatarUrl} alt="" width={28} height={28} className="w-full h-full object-cover" unoptimized />
                                ) : null}
                              </span>
                              <span>{user.username}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3">{user.chatMessages.toLocaleString()}</td>
                          <td className="py-3 pr-3">{user.voiceHours.toFixed(1)}h</td>
                          <td className="py-3 pr-3">{user.joins.toLocaleString()}</td>
                          <td className="py-3 pr-3">{user.leaves.toLocaleString()}</td>
                          <td className="py-3 font-semibold">{user.score.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
