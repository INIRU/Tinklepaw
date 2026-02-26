import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const { uuid } = await params;
  if (!uuid) {
    return NextResponse.json({ error: 'MISSING_UUID' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .schema('nyang')
    .from('mc_player_skills')
    .select('skill_points, mining_speed_lv, lucky_strike_lv, wide_harvest_lv, wide_plant_lv, freshness_lv, stone_skin_lv, harvest_fortune_lv')
    .eq('minecraft_uuid', uuid)
    .maybeSingle();

  return NextResponse.json({
    skillPoints: data?.skill_points ?? 0,
    miningSpeedLv: data?.mining_speed_lv ?? 0,
    luckyStrikeLv: data?.lucky_strike_lv ?? 0,
    wideHarvestLv: data?.wide_harvest_lv ?? 0,
    widePlantLv: data?.wide_plant_lv ?? 0,
    freshnessLv: data?.freshness_lv ?? 0,
    stoneSkinLv: data?.stone_skin_lv ?? 0,
    harvestFortuneLv: data?.harvest_fortune_lv ?? 0,
  });
}
