import { NextResponse } from 'next/server';
import type { Json } from '@nyaru/core';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { fetchMemberUserSummary } from '@/lib/server/discord';
import { getServerEnv } from '@/lib/server/env';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

type Period = 'day' | 'week' | 'month';

type ActivityEventRow = {
  user_id: string | null;
  event_type: string;
  value: number;
  created_at: string;
  meta: Json | null;
};

type PointEventRow = {
  discord_user_id: string;
  kind: string;
  amount: number;
  created_at: string;
};

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

type TopUserAggregate = {
  userId: string;
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

type EconomyPayload = {
  points: EconomyPoint[];
  totals: EconomyTotals;
  comparison: EconomyComparison;
  topSources: EconomyKindTotal[];
  topSinks: EconomyKindTotal[];
  sourceCategories: EconomyCategoryTotal[];
  sinkCategories: EconomyCategoryTotal[];
};

type AnalyticsSnapshotPayload = {
  generatedAt: string;
  filters: {
    rangeDays: number;
    channelId: string | null;
  };
  periods: Record<
    Period,
    {
      points: PeriodPoint[];
      topUsers: TopUser[];
      totals: PeriodTotals;
      comparison: PeriodComparison;
      economy: EconomyPayload;
    }
  >;
};

type AnalyticsResponsePayload = AnalyticsSnapshotPayload & {
  cache: {
    source: 'snapshot' | 'live';
    snapshotIntervalMinutes: number;
    ageSeconds: number;
  };
};

type CachedUserProfile = {
  username: string;
  avatarUrl: string | null;
};

type AnalyticsSnapshotRow = {
  snapshot_key: string;
  generated_at: string;
  payload: Json | null;
};

const ANALYTICS_CACHE_TTL_MS = 120_000;
const ANALYTICS_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const ANALYTICS_SNAPSHOT_INTERVAL_MINUTES = Math.floor(ANALYTICS_SNAPSHOT_INTERVAL_MS / (60 * 1000));
const USER_PROFILE_CACHE_TTL_MS = 1_800_000;

const analyticsCache = new Map<
  string,
  {
    expiresAt: number;
    payload: AnalyticsResponsePayload;
  }
>();

const userProfileCache = new Map<
  string,
  {
    expiresAt: number;
    profile: CachedUserProfile;
  }
>();

const ECONOMY_KIND_CATEGORY_MAP: Record<string, string> = {
  chat_grant: 'engagement_reward',
  voice_grant: 'engagement_reward',
  daily_chest_claim: 'daily_reward',
  lottery_ticket_purchase: 'lottery_spend',
  lottery_ticket_payout: 'lottery_reward',
  gacha_reward: 'gacha_reward',
  duplicate_refund: 'refund',
  gacha_spend: 'gacha_spend',
  sword_enhance_spend: 'forge_spend',
  sword_sell_reward: 'forge_reward',
  sword_forge_enhance: 'forge_spend',
  sword_forge_sell: 'forge_reward',
  admin_adjust: 'admin_adjustment',
};

const ECONOMY_CATEGORY_LABELS: Record<string, string> = {
  engagement_reward: '활동 보상',
  daily_reward: '일일 상자 보상',
  lottery_spend: '복권 구매',
  lottery_reward: '복권 당첨금',
  gacha_reward: '가챠 보상',
  refund: '환급/보정',
  gacha_spend: '가챠 소모',
  forge_spend: '강화 소모',
  forge_reward: '강화 판매 보상',
  admin_adjustment: '관리자 조정',
  other_source: '기타 발행',
  other_sink: '기타 소각',
};

const buildAnalyticsCacheKey = (rangeDays: number, channelId: string | null) => `${rangeDays}:${channelId ?? 'all'}`;

const pruneExpiredCaches = (nowMs: number) => {
  for (const [key, entry] of analyticsCache.entries()) {
    if (entry.expiresAt <= nowMs) analyticsCache.delete(key);
  }
  for (const [key, entry] of userProfileCache.entries()) {
    if (entry.expiresAt <= nowMs) userProfileCache.delete(key);
  }
};

const isAnalyticsSnapshotPayload = (value: Json | null): value is AnalyticsSnapshotPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<AnalyticsSnapshotPayload>;
  if (typeof candidate.generatedAt !== 'string') return false;
  if (!candidate.filters || typeof candidate.filters !== 'object') return false;
  if (!candidate.periods || typeof candidate.periods !== 'object') return false;
  return true;
};

const toAnalyticsResponsePayload = (
  payload: AnalyticsSnapshotPayload,
  source: AnalyticsResponsePayload['cache']['source'],
  nowMs: number,
): AnalyticsResponsePayload => {
  const generatedMs = Date.parse(payload.generatedAt);
  const ageSeconds = Number.isFinite(generatedMs)
    ? Math.max(0, Math.floor((nowMs - generatedMs) / 1000))
    : 0;
  return {
    ...payload,
    cache: {
      source,
      snapshotIntervalMinutes: ANALYTICS_SNAPSHOT_INTERVAL_MINUTES,
      ageSeconds,
    },
  };
};

const loadAnalyticsSnapshotFromDb = async (snapshotKey: string): Promise<AnalyticsSnapshotPayload | null> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('admin_analytics_snapshots')
    .select('snapshot_key, generated_at, payload')
    .eq('snapshot_key', snapshotKey)
    .maybeSingle();

  if (error) {
    console.error('[AdminAnalytics] snapshot read failed:', error.message);
    return null;
  }

  const snapshot = (data ?? null) as AnalyticsSnapshotRow | null;
  if (!snapshot || !isAnalyticsSnapshotPayload(snapshot.payload)) {
    return null;
  }

  if (snapshot.payload.generatedAt !== snapshot.generated_at) {
    return {
      ...snapshot.payload,
      generatedAt: snapshot.generated_at,
    };
  }

  return snapshot.payload;
};

const saveAnalyticsSnapshotToDb = async (params: {
  snapshotKey: string;
  rangeDays: number;
  channelId: string | null;
  payload: AnalyticsSnapshotPayload;
}): Promise<void> => {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('admin_analytics_snapshots').upsert(
    {
      snapshot_key: params.snapshotKey,
      range_days: params.rangeDays,
      channel_id: params.channelId,
      generated_at: params.payload.generatedAt,
      payload: params.payload,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'snapshot_key',
    },
  );

  if (error) {
    console.error('[AdminAnalytics] snapshot write failed:', error.message);
  }
};

const getCachedUserProfile = async (userId: string): Promise<CachedUserProfile | null> => {
  const nowMs = Date.now();
  const cached = userProfileCache.get(userId);
  if (cached && cached.expiresAt > nowMs) {
    return cached.profile;
  }

  const summary = await fetchMemberUserSummary(userId).catch(() => null);
  if (!summary) {
    return null;
  }

  const profile: CachedUserProfile = {
    username: summary.name,
    avatarUrl: summary.avatarUrl,
  };
  userProfileCache.set(userId, {
    expiresAt: nowMs + USER_PROFILE_CACHE_TTL_MS,
    profile,
  });
  return profile;
};

const PERIOD_BUCKET_COUNT: Record<Period, number> = {
  day: 30,
  week: 12,
  month: 12,
};

const startOfUtcDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const startOfUtcWeek = (date: Date) => {
  const day = startOfUtcDay(date);
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return day;
};

const startOfUtcMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const addUtcDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const addUtcMonths = (date: Date, months: number) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const formatDayLabel = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;

const formatMonthLabel = (date: Date) => `${String(date.getUTCFullYear()).slice(-2)}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const bucketKey = (period: Period, date: Date) => {
  if (period === 'month') return monthKey(startOfUtcMonth(date));
  if (period === 'week') return dayKey(startOfUtcWeek(date));
  return dayKey(startOfUtcDay(date));
};

const bucketLabel = (period: Period, bucketStart: Date) => {
  if (period === 'month') return formatMonthLabel(bucketStart);
  if (period === 'week') return `${formatDayLabel(bucketStart)}W`;
  return formatDayLabel(bucketStart);
};

const buildBuckets = (period: Period, now: Date) => {
  const count = PERIOD_BUCKET_COUNT[period];
  const starts: Date[] = [];

  if (period === 'day') {
    const today = startOfUtcDay(now);
    for (let i = count - 1; i >= 0; i -= 1) {
      starts.push(addUtcDays(today, -i));
    }
  } else if (period === 'week') {
    const thisWeek = startOfUtcWeek(now);
    for (let i = count - 1; i >= 0; i -= 1) {
      starts.push(addUtcDays(thisWeek, -i * 7));
    }
  } else {
    const thisMonth = startOfUtcMonth(now);
    for (let i = count - 1; i >= 0; i -= 1) {
      starts.push(addUtcMonths(thisMonth, -i));
    }
  }

  const points = starts.map((start) => ({
    key: period === 'month' ? monthKey(start) : dayKey(start),
    label: bucketLabel(period, start),
    joins: 0,
    leaves: 0,
    chatMessages: 0,
    voiceHours: 0,
    joinRatePct: 0,
    churnRatePct: 0,
  }));

  return { starts, points };
};

const fetchActivityEvents = async (guildId: string, startIso: string) => {
  const supabase = createSupabaseAdminClient();
  const pageSize = 1000;
  const events: ActivityEventRow[] = [];

  for (let from = 0; from < 200_000; from += pageSize) {
    const { data, error } = await supabase
      .from('activity_events')
      .select('user_id, event_type, value, created_at, meta')
      .eq('guild_id', guildId)
      .gte('created_at', startIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as ActivityEventRow[];
    events.push(...rows);
    if (rows.length < pageSize) break;
  }

  return events;
};

const fetchPointEvents = async (startIso: string) => {
  const supabase = createSupabaseAdminClient();
  const pageSize = 1000;
  const events: PointEventRow[] = [];

  for (let from = 0; from < 200_000; from += pageSize) {
    const { data, error } = await supabase
      .from('point_events')
      .select('discord_user_id, kind, amount, created_at')
      .gte('created_at', startIso)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as PointEventRow[];
    events.push(...rows);
    if (rows.length < pageSize) break;
  }

  return events;
};

const parseChannelIdFromMeta = (meta: Json | null) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const value = meta as Record<string, Json>;
  return typeof value.channel_id === 'string' ? value.channel_id : null;
};

const comparePct = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
};

const resolveEconomyCategoryKey = (kind: string, amount: number): string => {
  const mapped = ECONOMY_KIND_CATEGORY_MAP[kind];
  if (mapped) return mapped;
  if (amount > 0) return 'other_source';
  if (amount < 0) return 'other_sink';
  return 'other_source';
};

const movingAverage = (series: number[], windowSize: number) =>
  series.map((_, index) => {
    const from = Math.max(0, index - windowSize + 1);
    const sample = series.slice(from, index + 1);
    const sum = sample.reduce((acc, value) => acc + value, 0);
    return Number((sum / Math.max(sample.length, 1)).toFixed(2));
  });

const trendline = (series: number[]) => {
  if (series.length === 0) return [] as number[];

  const n = series.length;
  const sumX = ((n - 1) * n) / 2;
  const sumY = series.reduce((acc, value) => acc + value, 0);
  const sumXY = series.reduce((acc, value, index) => acc + index * value, 0);
  const sumXX = series.reduce((acc, _value, index) => acc + index * index, 0);
  const denominator = n * sumXX - sumX * sumX;

  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return series.map((_, index) => Number((intercept + slope * index).toFixed(2)));
};

const aggregatePeriod = (
  period: Period,
  events: ActivityEventRow[],
  now: Date,
) => {
  const { starts, points } = buildBuckets(period, now);
  const pointByKey = new Map(points.map((point) => [point.key, point]));
  const periodStartMs = starts[0]?.getTime() ?? 0;

  const userStats = new Map<string, { chatMessages: number; voiceSeconds: number; joins: number; leaves: number }>();

  for (const event of events) {
    const createdAt = new Date(event.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const key = bucketKey(period, createdAt);
    const point = pointByKey.get(key);
    if (!point) continue;

    const value = Math.max(0, Number.isFinite(event.value) ? Math.floor(event.value) : 1);
    if (event.event_type === 'member_join') {
      point.joins += value;
    } else if (event.event_type === 'member_leave') {
      point.leaves += value;
    } else if (event.event_type === 'chat_message') {
      point.chatMessages += value;
    } else if (event.event_type === 'voice_seconds') {
      point.voiceHours += value / 3600;
    }

    if (event.user_id && createdAt.getTime() >= periodStartMs) {
      const stats = userStats.get(event.user_id) ?? { chatMessages: 0, voiceSeconds: 0, joins: 0, leaves: 0 };
      if (event.event_type === 'chat_message') stats.chatMessages += value;
      if (event.event_type === 'voice_seconds') stats.voiceSeconds += value;
      if (event.event_type === 'member_join') stats.joins += value;
      if (event.event_type === 'member_leave') stats.leaves += value;
      userStats.set(event.user_id, stats);
    }
  }

  const normalizedPoints: PeriodPoint[] = points.map((point) => {
    const movement = point.joins + point.leaves;
    const joinRatePct = movement > 0 ? (point.joins / movement) * 100 : 0;
    const churnRatePct = movement > 0 ? (point.leaves / movement) * 100 : 0;

    return {
      ...point,
      voiceHours: Number(point.voiceHours.toFixed(2)),
      joinRatePct: Number(joinRatePct.toFixed(2)),
      churnRatePct: Number(churnRatePct.toFixed(2)),
    };
  });

  const topUsers: TopUserAggregate[] = Array.from(userStats.entries())
    .map(([userId, stats]) => {
      const score = stats.chatMessages + Math.round(stats.voiceSeconds / 60);
      return {
        userId,
        chatMessages: stats.chatMessages,
        voiceHours: Number((stats.voiceSeconds / 3600).toFixed(2)),
        joins: stats.joins,
        leaves: stats.leaves,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  const totals: PeriodTotals = normalizedPoints.reduce(
    (acc, point) => {
      acc.joins += point.joins;
      acc.leaves += point.leaves;
      acc.chatMessages += point.chatMessages;
      acc.voiceHours += point.voiceHours;
      return acc;
    },
    { joins: 0, leaves: 0, chatMessages: 0, voiceHours: 0 }
  );

  const latest = normalizedPoints.at(-1);
  const previous = normalizedPoints.at(-2);
  const comparison: PeriodComparison = {
    joinsPct: Number(comparePct(latest?.joins ?? 0, previous?.joins ?? 0).toFixed(2)),
    leavesPct: Number(comparePct(latest?.leaves ?? 0, previous?.leaves ?? 0).toFixed(2)),
    chatMessagesPct: Number(comparePct(latest?.chatMessages ?? 0, previous?.chatMessages ?? 0).toFixed(2)),
    voiceHoursPct: Number(comparePct(latest?.voiceHours ?? 0, previous?.voiceHours ?? 0).toFixed(2)),
  };

  return {
    points: normalizedPoints,
    topUsers,
    totals: {
      joins: totals.joins,
      leaves: totals.leaves,
      chatMessages: totals.chatMessages,
      voiceHours: Number(totals.voiceHours.toFixed(2)),
    },
    comparison,
  };
};

const aggregateEconomyPeriod = (
  period: Period,
  events: PointEventRow[],
  now: Date,
): EconomyPayload => {
  const { starts } = buildBuckets(period, now);
  const points: EconomyPoint[] = starts.map((start) => ({
    key: period === 'month' ? monthKey(start) : dayKey(start),
    label: bucketLabel(period, start),
    issued: 0,
    burned: 0,
    net: 0,
    cumulative: 0,
    activeUsers: 0,
    netMovingAvg7: 0,
    netTrend: 0,
  }));
  const pointByKey = new Map(points.map((point) => [point.key, point]));

  const activeUsersByKey = new Map<string, Set<string>>();
  const periodActiveUsers = new Set<string>();
  const kindTotals = new Map<string, EconomyKindTotal>();
  const categoryTotals = new Map<string, EconomyCategoryTotal>();

  for (const event of events) {
    const createdAt = new Date(event.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const key = bucketKey(period, createdAt);
    const point = pointByKey.get(key);
    if (!point) continue;

    const amount = Number.isFinite(event.amount) ? Math.trunc(event.amount) : 0;
    const issued = amount > 0 ? amount : 0;
    const burned = amount < 0 ? -amount : 0;

    point.issued += issued;
    point.burned += burned;
    point.net += amount;

    if (event.discord_user_id && amount !== 0) {
      const users = activeUsersByKey.get(key) ?? new Set<string>();
      users.add(event.discord_user_id);
      activeUsersByKey.set(key, users);
      periodActiveUsers.add(event.discord_user_id);
    }

    if (amount !== 0) {
      const totals = kindTotals.get(event.kind) ?? {
        kind: event.kind,
        issued: 0,
        burned: 0,
        net: 0,
      };
      totals.issued += issued;
      totals.burned += burned;
      totals.net += amount;
      kindTotals.set(event.kind, totals);

      const categoryKey = resolveEconomyCategoryKey(event.kind, amount);
      const category = categoryTotals.get(categoryKey) ?? {
        category: categoryKey,
        label: ECONOMY_CATEGORY_LABELS[categoryKey] ?? categoryKey,
        issued: 0,
        burned: 0,
        net: 0,
        eventCount: 0,
        kinds: [],
      };
      category.issued += issued;
      category.burned += burned;
      category.net += amount;
      category.eventCount += 1;
      if (!category.kinds.includes(event.kind)) {
        category.kinds.push(event.kind);
      }
      categoryTotals.set(categoryKey, category);
    }
  }

  let runningCumulative = 0;
  const normalizedPoints = points.map((point) => {
    runningCumulative += point.net;
    return {
      ...point,
      cumulative: runningCumulative,
      activeUsers: activeUsersByKey.get(point.key)?.size ?? 0,
    };
  });

  const netSeries = normalizedPoints.map((point) => point.net);
  const netMovingAvg7 = movingAverage(netSeries, 7);
  const netTrend = trendline(netSeries);
  const enrichedPoints = normalizedPoints.map((point, index) => ({
    ...point,
    netMovingAvg7: netMovingAvg7[index] ?? 0,
    netTrend: netTrend[index] ?? 0,
  }));

  const totals = enrichedPoints.reduce(
    (acc, point) => {
      acc.issued += point.issued;
      acc.burned += point.burned;
      acc.net += point.net;
      acc.cumulative = point.cumulative;
      return acc;
    },
    {
      issued: 0,
      burned: 0,
      net: 0,
      cumulative: 0,
      activeUsers: periodActiveUsers.size,
    }
  );

  const latest = enrichedPoints.at(-1);
  const previous = enrichedPoints.at(-2);
  const comparison: EconomyComparison = {
    issuedPct: Number(comparePct(latest?.issued ?? 0, previous?.issued ?? 0).toFixed(2)),
    burnedPct: Number(comparePct(latest?.burned ?? 0, previous?.burned ?? 0).toFixed(2)),
    netPct: Number(comparePct(latest?.net ?? 0, previous?.net ?? 0).toFixed(2)),
  };

  const kindTotalsArray = Array.from(kindTotals.values());
  const categoryTotalsArray = Array.from(categoryTotals.values()).map((value) => ({
    ...value,
    kinds: [...value.kinds].sort(),
  }));
  const topSources = kindTotalsArray
    .filter((value) => value.issued > 0)
    .sort((a, b) => b.issued - a.issued)
    .slice(0, 5);
  const topSinks = kindTotalsArray
    .filter((value) => value.burned > 0)
    .sort((a, b) => b.burned - a.burned)
    .slice(0, 5);
  const sourceCategories = categoryTotalsArray
    .filter((value) => value.issued > 0)
    .sort((a, b) => b.issued - a.issued)
    .slice(0, 5);
  const sinkCategories = categoryTotalsArray
    .filter((value) => value.burned > 0)
    .sort((a, b) => b.burned - a.burned)
    .slice(0, 5);

  return {
    points: enrichedPoints,
    totals,
    comparison,
    topSources,
    topSinks,
    sourceCategories,
    sinkCategories,
  };
};

const resolveTopUsers = async (
  topUsers: TopUserAggregate[],
  usersById: Map<string, { username: string; avatarUrl: string | null }>
): Promise<TopUser[]> => {
  const unresolvedIds = topUsers
    .map((user) => user.userId)
    .filter((userId) => !usersById.has(userId));

  if (unresolvedIds.length > 0) {
    await Promise.all(
      unresolvedIds.map(async (userId) => {
        const profile = await getCachedUserProfile(userId);
        if (profile) {
          usersById.set(userId, {
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          });
        }
      })
    );
  }

  return topUsers.map((user) => {
    const profile = usersById.get(user.userId);
    return {
      userId: user.userId,
      username: profile?.username ?? '알 수 없는 사용자',
      avatarUrl: profile?.avatarUrl ?? null,
      chatMessages: user.chatMessages,
      voiceHours: user.voiceHours,
      joins: user.joins,
      leaves: user.leaves,
      score: user.score,
    };
  });
};

export async function GET(request: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(request.url);
  const rangeDaysRaw = Number(url.searchParams.get('rangeDays') ?? '365');
  const rangeDays = Math.max(30, Math.min(Number.isFinite(rangeDaysRaw) ? Math.floor(rangeDaysRaw) : 365, 365));
  const channelIdFilter = (url.searchParams.get('channelId') ?? '').trim() || null;

  const nowMs = Date.now();
  pruneExpiredCaches(nowMs);
  const cacheKey = buildAnalyticsCacheKey(rangeDays, channelIdFilter);
  const cached = analyticsCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return NextResponse.json(cached.payload);
  }

  const dbSnapshotPayload = await loadAnalyticsSnapshotFromDb(cacheKey);
  const dbSnapshotResponse = dbSnapshotPayload
    ? toAnalyticsResponsePayload(dbSnapshotPayload, 'snapshot', nowMs)
    : null;

  if (dbSnapshotResponse) {
    const generatedMs = Date.parse(dbSnapshotResponse.generatedAt);
    const ageMs = Number.isFinite(generatedMs)
      ? Math.max(0, nowMs - generatedMs)
      : Number.POSITIVE_INFINITY;
    if (ageMs <= ANALYTICS_SNAPSHOT_INTERVAL_MS) {
      const snapshotRemainingMs = Math.max(5_000, ANALYTICS_SNAPSHOT_INTERVAL_MS - ageMs);
      analyticsCache.set(cacheKey, {
        expiresAt: nowMs + Math.min(ANALYTICS_CACHE_TTL_MS, snapshotRemainingMs),
        payload: dbSnapshotResponse,
      });
      return NextResponse.json(dbSnapshotResponse);
    }
  }

  const env = getServerEnv();
  const now = new Date();
  const earliestDay = addUtcDays(startOfUtcDay(now), -rangeDays);

  let events: ActivityEventRow[] = [];
  let pointEvents: PointEventRow[] = [];
  try {
    const startIso = earliestDay.toISOString();
    const [activityRows, pointRows] = await Promise.all([
      fetchActivityEvents(env.NYARU_GUILD_ID, startIso),
      fetchPointEvents(startIso),
    ]);
    events = activityRows;
    pointEvents = pointRows;
  } catch (error) {
    if (dbSnapshotResponse) {
      return NextResponse.json(dbSnapshotResponse);
    }
    const message = error instanceof Error ? error.message : 'Failed to load activity events';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const filteredEvents = channelIdFilter
    ? events.filter((event) => {
        if (event.event_type === 'chat_message' || event.event_type === 'voice_seconds') {
          return parseChannelIdFromMeta(event.meta) === channelIdFilter;
        }
        return true;
      })
    : events;

  const usersById = new Map<string, { username: string; avatarUrl: string | null }>();

  const dayBase = aggregatePeriod('day', filteredEvents, now);
  const weekBase = aggregatePeriod('week', filteredEvents, now);
  const monthBase = aggregatePeriod('month', filteredEvents, now);
  const dayEconomy = aggregateEconomyPeriod('day', pointEvents, now);
  const weekEconomy = aggregateEconomyPeriod('week', pointEvents, now);
  const monthEconomy = aggregateEconomyPeriod('month', pointEvents, now);

  const topUserIds = Array.from(new Set([
    ...dayBase.topUsers.map((user) => user.userId),
    ...weekBase.topUsers.map((user) => user.userId),
    ...monthBase.topUsers.map((user) => user.userId),
  ]));

  if (topUserIds.length > 0) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('users')
      .select('discord_user_id, username, avatar_url')
      .in('discord_user_id', topUserIds);

    for (const user of data ?? []) {
      usersById.set(user.discord_user_id, {
        username: user.username ?? user.discord_user_id,
        avatarUrl: user.avatar_url,
      });
    }
  }

  const [dayTopUsers, weekTopUsers, monthTopUsers] = await Promise.all([
    resolveTopUsers(dayBase.topUsers, usersById),
    resolveTopUsers(weekBase.topUsers, usersById),
    resolveTopUsers(monthBase.topUsers, usersById),
  ]);

  const snapshotPayload: AnalyticsSnapshotPayload = {
    generatedAt: now.toISOString(),
    filters: {
      rangeDays,
      channelId: channelIdFilter,
    },
    periods: {
      day: {
        points: dayBase.points,
        topUsers: dayTopUsers,
        totals: dayBase.totals,
        comparison: dayBase.comparison,
        economy: dayEconomy,
      },
      week: {
        points: weekBase.points,
        topUsers: weekTopUsers,
        totals: weekBase.totals,
        comparison: weekBase.comparison,
        economy: weekEconomy,
      },
      month: {
        points: monthBase.points,
        topUsers: monthTopUsers,
        totals: monthBase.totals,
        comparison: monthBase.comparison,
        economy: monthEconomy,
      },
    },
  };

  await saveAnalyticsSnapshotToDb({
    snapshotKey: cacheKey,
    rangeDays,
    channelId: channelIdFilter,
    payload: snapshotPayload,
  });

  const responsePayload = toAnalyticsResponsePayload(snapshotPayload, 'live', nowMs);

  analyticsCache.set(cacheKey, {
    expiresAt: nowMs + ANALYTICS_CACHE_TTL_MS,
    payload: responsePayload,
  });

  return NextResponse.json(responsePayload);
}
