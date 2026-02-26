import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const { uuid } = await params;
  const supabase = createSupabaseAdminClient();

  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id, minecraft_name, linked_at')
    .eq('minecraft_uuid', uuid)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ linked: false });
  }

  const [{ data: balance }, { data: job }, { data: equippedItem }, { data: personalRole }] = await Promise.all([
    supabase
      .schema('nyang')
      .from('point_balances')
      .select('balance')
      .eq('discord_user_id', player.discord_user_id)
      .maybeSingle(),
    supabase
      .schema('nyang')
      .from('minecraft_jobs')
      .select('job, level, xp')
      .eq('minecraft_uuid', uuid)
      .maybeSingle(),
    supabase
      .schema('nyang')
      .from('equipped')
      .select('items(item_name)')
      .eq('discord_user_id', player.discord_user_id)
      .maybeSingle(),
    supabase
      .schema('nyang')
      .from('personal_roles')
      .select('discord_user_id')
      .eq('discord_user_id', player.discord_user_id)
      .maybeSingle(),
  ]);

  const equippedItemName = (equippedItem as { items?: { item_name?: string } | null } | null)?.items?.item_name ?? null;
  const title = equippedItemName ?? (personalRole ? '부스터' : null);

  return NextResponse.json({
    linked: true,
    discordUserId: player.discord_user_id,
    minecraftName: player.minecraft_name,
    balance: balance?.balance ?? 0,
    job: job?.job ?? 'miner',
    level: job?.level ?? 1,
    xp: job?.xp ?? 0,
    title,
  });
}
