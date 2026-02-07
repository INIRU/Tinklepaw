'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ChartColumnBig, MessageCircle, UserPlus, UserMinus, Phone } from 'lucide-react';

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
  score: number;
};

type AnalyticsResponse = {
  generatedAt: string;
  periods: Record<Period, { points: PeriodPoint[]; topUsers: TopUser[] }>;
};

type MetricKey = keyof Pick<PeriodPoint, 'joins' | 'leaves' | 'chatMessages' | 'voiceHours' | 'joinRatePct' | 'churnRatePct'>;

const PERIOD_LABEL: Record<Period, string> = {
  day: '일별',
  week: '주별',
  month: '월별'
};

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

export default function AdminAnalyticsClient() {
  const [period, setPeriod] = useState<Period>('day');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/analytics', { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? '통계를 불러오지 못했습니다.');
        }
        const body = (await res.json()) as AnalyticsResponse;
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const selected = useMemo(() => data?.periods[period] ?? { points: [], topUsers: [] }, [data, period]);

  const totals = useMemo(() => {
    return selected.points.reduce(
      (acc, point) => {
        acc.joins += point.joins;
        acc.leaves += point.leaves;
        acc.chatMessages += point.chatMessages;
        acc.voiceHours += point.voiceHours;
        return acc;
      },
      { joins: 0, leaves: 0, chatMessages: 0, voiceHours: 0 }
    );
  }, [selected.points]);

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
          <div className="flex flex-wrap gap-2">
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
          </div>
          <div className="mt-3 text-xs muted">
            집계 단위: {PERIOD_LABEL[period]} · 마지막 업데이트:{' '}
            {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center muted">통계를 불러오는 중...</div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 p-6 text-rose-300">{error}</div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 입장</div>
                <div className="mt-1 text-xl font-bold">{totals.joins.toLocaleString()}명</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 이탈</div>
                <div className="mt-1 text-xl font-bold">{totals.leaves.toLocaleString()}명</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 채팅</div>
                <div className="mt-1 text-xl font-bold">{totals.chatMessages.toLocaleString()}개</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.12em] muted">총 통화 시간</div>
                <div className="mt-1 text-xl font-bold">{totals.voiceHours.toFixed(1)}시간</div>
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
                      <th className="py-2">점수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.topUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center muted">집계된 활동 유저가 없습니다.</td>
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
