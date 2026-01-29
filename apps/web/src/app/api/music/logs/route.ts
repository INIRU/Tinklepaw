import { NextResponse } from 'next/server';

import { fetchMemberUserSummary } from '@/lib/server/discord';
import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireGuildMemberApi();
  if (isResponse(ctx)) {
    console.warn('[api/music/logs] auth failed', { status: ctx.status });
    return ctx;
  }

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('music_control_logs')
    .select('log_id, action, status, message, payload, requested_by, created_at')
    .eq('guild_id', env.NYARU_GUILD_ID)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[api/music/logs] supabase error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = Array.from(new Set((data ?? []).map((row) => row.requested_by).filter(Boolean))) as string[];
  const summaries = await Promise.all(ids.map(async (id) => [id, await fetchMemberUserSummary(id)] as const));
  const summaryMap = new Map(summaries);

  const logs = (data ?? []).map((row) => ({
    ...row,
    requested_by_user: row.requested_by ? summaryMap.get(row.requested_by) ?? null : null
  }));

  console.info('[api/music/logs] ok', { guildId: env.NYARU_GUILD_ID, userId: ctx.session.user.id });
  return NextResponse.json({ logs });
}
