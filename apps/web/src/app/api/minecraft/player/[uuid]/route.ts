import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

interface DiscordRole { id: string; color: number; icon: string | null; }
let rolesCache: { roles: DiscordRole[]; cachedAt: number } | null = null;

async function getGuildRoles(): Promise<DiscordRole[]> {
  if (rolesCache && Date.now() - rolesCache.cachedAt < 5 * 60 * 1000) return rolesCache.roles;
  const guildId = process.env.NYARU_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !token) return [];
  const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) return [];
  const roles = await res.json() as DiscordRole[];
  rolesCache = { roles, cachedAt: Date.now() };
  return roles;
}

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

  const [[{ data: balance }, { data: job }, { data: equippedItem }], guildRoles] = await Promise.all([
    Promise.all([
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
        .select('items(name, discord_role_id)')
        .eq('discord_user_id', player.discord_user_id)
        .maybeSingle(),
    ]),
    getGuildRoles(),
  ]);

  const itemData = (equippedItem as { items?: { name?: string; discord_role_id?: string | null } | null } | null)?.items;
  const title = itemData?.name ?? null;
  const discordRole = guildRoles.find(r => r.id === itemData?.discord_role_id);
  const titleColor = discordRole && discordRole.color
    ? `#${discordRole.color.toString(16).padStart(6, '0')}`
    : null;
  const titleIconUrl = discordRole?.icon
    ? `https://cdn.discordapp.com/role-icons/${discordRole.id}/${discordRole.icon}.png`
    : null;

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
    titleIconUrl,
  });
}
