import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string; questId?: string } | null;
  if (!body?.uuid || !body?.questId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const supabase = createSupabaseAdminClient();

  const { data: quest } = await supabase
    .schema('nyang')
    .from('mc_daily_quests')
    .select('id, completed, claimed, mc_quest_templates(reward_points)')
    .eq('minecraft_uuid', body.uuid)
    .eq('quest_id', body.questId)
    .eq('quest_date', today)
    .maybeSingle();

  if (!quest) return NextResponse.json({ error: 'QUEST_NOT_FOUND' }, { status: 404 });
  if (!quest.completed) return NextResponse.json({ error: 'NOT_COMPLETED' }, { status: 400 });
  if (quest.claimed) return NextResponse.json({ error: 'ALREADY_CLAIMED' }, { status: 400 });

  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!player) return NextResponse.json({ error: 'PLAYER_NOT_LINKED' }, { status: 404 });

  const template = quest.mc_quest_templates as unknown as { reward_points: number } | null;
  const rewardPoints = template?.reward_points ?? 0;

  await supabase.schema('nyang').from('point_events').insert({
    discord_user_id: player.discord_user_id,
    amount: rewardPoints,
    kind: `minecraft_quest:${body.questId}`,
  });

  await supabase.schema('nyang').from('mc_daily_quests').update({ claimed: true }).eq('id', quest.id);

  return NextResponse.json({ rewardPoints });
}
