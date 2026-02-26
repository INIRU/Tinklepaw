import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('minecraft_uuid, discord_user_id, minecraft_name, linked_at, minecraft_jobs(job, level, xp)')
    .order('linked_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ players: data ?? [] });
}
