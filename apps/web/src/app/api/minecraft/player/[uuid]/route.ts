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

  const rarityColors: Record<string, string> = {
    SSS: '#fbbf24',
    SS:  '#a855f7',
    S:   '#3b82f6',
    R:   '#94a3b8',
  };

  const [{ data: balance }, { data: job }, { data: equippedItem }] = await Promise.all([
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
      .select('items(name, rarity)')
      .eq('discord_user_id', player.discord_user_id)
      .maybeSingle(),
  ]);

  const itemData = (equippedItem as { items?: { name?: string; rarity?: string } | null } | null)?.items;
  const title = itemData?.name ?? null;
  const titleColor = itemData?.rarity ? (rarityColors[itemData.rarity] ?? '#ffffff') : null;

  return NextResponse.json({
    linked: true,
    discordUserId: player.discord_user_id,
    minecraftName: player.minecraft_name,
    balance: balance?.balance ?? 0,
    job: job?.job ?? 'miner',
    level: job?.level ?? 1,
    xp: job?.xp ?? 0,
    title,
    titleColor,
  });
}
