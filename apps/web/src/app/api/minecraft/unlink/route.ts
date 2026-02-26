import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string } | null;
  if (!body?.uuid) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: 'NOT_LINKED' }, { status: 404 });
  }

  // Delete dependent records first to avoid FK constraint violations
  await Promise.all([
    supabase.schema('nyang').from('mc_market_trades').delete().eq('minecraft_uuid', body.uuid),
    supabase.schema('nyang').from('mc_daily_quests').delete().eq('minecraft_uuid', body.uuid),
    supabase.schema('nyang').from('mc_p2p_listings').delete().eq('seller_uuid', body.uuid),
  ]);

  // Delete player (cascades to minecraft_jobs)
  const { error } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .delete()
    .eq('minecraft_uuid', body.uuid);

  if (error) {
    return NextResponse.json({ error: 'DELETE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
