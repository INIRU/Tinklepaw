import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

const MONITOR_SERVICES = ['bot', 'lavalink'] as const;

export async function GET() {
  const ctx = await requireGuildMemberApi();
  if (isResponse(ctx)) {
    return ctx;
  }

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();

  const [{ data: samples, error: samplesError }, { data: incidents, error: incidentsError }] = await Promise.all([
    supabase
      .from('status_samples')
      .select('service, status, created_at')
      .in('service', [...MONITOR_SERVICES])
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('music_control_logs')
      .select('log_id, status, message, payload, created_at')
      .eq('guild_id', env.NYARU_GUILD_ID)
      .eq('action', 'monitor')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (samplesError) {
    return NextResponse.json({ error: samplesError.message }, { status: 500 });
  }

  if (incidentsError) {
    return NextResponse.json({ error: incidentsError.message }, { status: 500 });
  }

  const bot = (samples ?? []).filter((sample) => sample.service === 'bot').reverse();
  const lavalink = (samples ?? []).filter((sample) => sample.service === 'lavalink').reverse();

  return NextResponse.json({
    services: {
      bot,
      lavalink,
    },
    incidents: incidents ?? [],
  });
}
