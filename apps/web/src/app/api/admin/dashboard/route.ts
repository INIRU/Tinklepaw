import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const nowMs = Date.now();
  const oneDayAgoIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

  const [
    statusResult,
    pointEvents24hResult,
    latestPointEventResult,
    totalUsersResult,
    activeUsers24hResult,
    botConfigResult,
    avgBalanceResult,
  ] = await Promise.all([
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
    supabase
      .from('users')
      .select('discord_user_id', { count: 'exact', head: true })
      .gte('last_seen_at', oneDayAgoIso),
    supabase.from('app_config').select('bot_sync_interval_ms').eq('id', 1).maybeSingle(),
    supabase.from('point_balances').select('balance'),
  ]);

  let avgPoints: number | null = null;
  let avgSampleCount = 0;

  if (!avgBalanceResult.error && avgBalanceResult.data) {
    const rows = avgBalanceResult.data;
    let sum = 0;
    for (const row of rows) {
      sum += Number(row.balance ?? 0);
    }
    avgSampleCount = rows.length;
    avgPoints = rows.length > 0 ? sum / rows.length : 0;
  }

  const statusRows = statusResult.data ?? [];
  const botSample = statusRows.find((r) => r.service === 'bot') ?? null;
  const lavalinkSample = statusRows.find((r) => r.service === 'lavalink') ?? null;

  const configuredIntervalMs = Number(botConfigResult.data?.bot_sync_interval_ms ?? Number.NaN);
  const statusIntervalMs =
    Number.isFinite(configuredIntervalMs) && configuredIntervalMs > 0
      ? Math.max(configuredIntervalMs, 10 * 60 * 1000)
      : 10 * 60 * 1000;

  return NextResponse.json({
    bot: {
      status: botSample?.status ?? null,
      sampledAt: botSample?.created_at ?? null,
    },
    lavalink: {
      status: lavalinkSample?.status ?? null,
      sampledAt: lavalinkSample?.created_at ?? null,
    },
    statusIntervalMs,
    pointEvents24h: pointEvents24hResult.error ? null : (pointEvents24hResult.count ?? 0),
    latestPointEventAt: latestPointEventResult.error ? null : (latestPointEventResult.data?.created_at ?? null),
    totalUsers: totalUsersResult.error ? null : (totalUsersResult.count ?? 0),
    activeUsers24h: activeUsers24hResult.error ? null : (activeUsers24hResult.count ?? 0),
    avgPoints,
    avgSampleCount,
  });
}
