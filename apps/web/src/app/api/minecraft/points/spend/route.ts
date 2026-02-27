import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string; amount?: number; reason?: string } | null;
  if (!body?.uuid || !body?.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!player) return NextResponse.json({ error: 'PLAYER_NOT_LINKED' }, { status: 404 });

  const { data: balance } = await supabase
    .schema('nyang')
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', player.discord_user_id)
    .maybeSingle();

  if ((balance?.balance ?? 0) < body.amount) {
    return NextResponse.json({ error: 'INSUFFICIENT_POINTS' }, { status: 400 });
  }

  const { error } = await supabase.schema('nyang').from('point_events').insert({
    discord_user_id: player.discord_user_id,
    amount: -body.amount,
    kind: `minecraft_spend:${body.reason ?? 'unknown'}`,
  });

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });

  return NextResponse.json({ success: true });
}
