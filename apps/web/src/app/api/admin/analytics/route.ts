import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { getServerEnv } from '@/lib/server/env';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

type Period = 'day' | 'week' | 'month';

type ActivityEventRow = {
  user_id: string | null;
  event_type: string;
  value: number;
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
  score: number;
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
      .select('user_id, event_type, value, created_at')
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

const aggregatePeriod = (
  period: Period,
  events: ActivityEventRow[],
  now: Date,
  usersById: Map<string, { username: string; avatarUrl: string | null }>,
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

  const topUsers: TopUser[] = Array.from(userStats.entries())
    .map(([userId, stats]) => {
      const score = stats.chatMessages + Math.round(stats.voiceSeconds / 60) + stats.joins * 2;
      const profile = usersById.get(userId);
      return {
        userId,
        username: profile?.username ?? userId,
        avatarUrl: profile?.avatarUrl ?? null,
        chatMessages: stats.chatMessages,
        voiceHours: Number((stats.voiceSeconds / 3600).toFixed(2)),
        joins: stats.joins,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return {
    points: normalizedPoints,
    topUsers,
  };
};

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const env = getServerEnv();
  const now = new Date();
  const earliestDay = addUtcDays(startOfUtcDay(now), -365);

  let events: ActivityEventRow[] = [];
  try {
    events = await fetchActivityEvents(env.NYARU_GUILD_ID, earliestDay.toISOString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load activity events';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const allUserIds = Array.from(new Set(events.map((event) => event.user_id).filter((value): value is string => Boolean(value))));
  const usersById = new Map<string, { username: string; avatarUrl: string | null }>();

  if (allUserIds.length > 0) {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('users')
      .select('discord_user_id, username, avatar_url')
      .in('discord_user_id', allUserIds);

    for (const user of data ?? []) {
      usersById.set(user.discord_user_id, {
        username: user.username ?? user.discord_user_id,
        avatarUrl: user.avatar_url,
      });
    }
  }

  const day = aggregatePeriod('day', events, now, usersById);
  const week = aggregatePeriod('week', events, now, usersById);
  const month = aggregatePeriod('month', events, now, usersById);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    periods: {
      day,
      week,
      month,
    },
  });
}
