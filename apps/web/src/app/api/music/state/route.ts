import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireGuildMemberApi();
  if (isResponse(ctx)) {
    console.warn('[api/music/state] auth failed', { status: ctx.status });
    return ctx;
  }

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from('music_state')
    .select('guild_id, current_track, queue, updated_at')
    .eq('guild_id', env.NYARU_GUILD_ID)
    .maybeSingle();

  if (error) {
    console.error('[api/music/state] supabase error', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info('[api/music/state] ok', { guildId: env.NYARU_GUILD_ID, userId: ctx.session.user.id });
  return NextResponse.json({ state: data ?? null });
}
