import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

const SKILL_MAX: Record<string, number> = {
  mining_speed: 3,
  lucky_strike: 3,
  wide_harvest: 1,
  wide_plant: 1,
  freshness: 3,
  stone_skin: 3,
  harvest_fortune: 3,
};

// 각 스킬의 다음 레벨 업그레이드에 필요한 최소 직업 레벨
// index 0 = Lv0→Lv1, index 1 = Lv1→Lv2, index 2 = Lv2→Lv3
const SKILL_LEVEL_REQ: Record<string, number[]> = {
  mining_speed:    [1, 5, 10],
  lucky_strike:    [3, 8, 15],
  stone_skin:      [7, 12, 20],
  wide_harvest:    [3],
  wide_plant:      [5],
  freshness:       [1, 7, 15],
  harvest_fortune: [5, 10, 20],
};

const SKILL_COLUMN: Record<string, string> = {
  mining_speed: 'mining_speed_lv',
  lucky_strike: 'lucky_strike_lv',
  wide_harvest: 'wide_harvest_lv',
  wide_plant: 'wide_plant_lv',
  freshness: 'freshness_lv',
  stone_skin: 'stone_skin_lv',
  harvest_fortune: 'harvest_fortune_lv',
};

const MINER_SKILLS = new Set(['mining_speed', 'lucky_strike', 'stone_skin']);
const FARMER_SKILLS = new Set(['wide_harvest', 'wide_plant', 'freshness', 'harvest_fortune']);

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = (await req.json().catch(() => null)) as { uuid?: string; skill?: string } | null;
  if (!body?.uuid || !body?.skill) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const maxLevel = SKILL_MAX[body.skill];
  const column = SKILL_COLUMN[body.skill];
  if (maxLevel === undefined || !column) {
    return NextResponse.json({ error: 'INVALID_SKILL' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Check player exists
  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('minecraft_uuid')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 });
  }

  // Job validation
  const { data: jobData } = await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .select('job')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  const job = jobData?.job ?? 'miner';
  if (
    (MINER_SKILLS.has(body.skill) && job !== 'miner') ||
    (FARMER_SKILLS.has(body.skill) && job !== 'farmer')
  ) {
    return NextResponse.json({ error: 'WRONG_JOB' }, { status: 400 });
  }

  // Upsert skill row if not exists
  await supabase
    .schema('nyang')
    .from('mc_player_skills')
    .upsert({ minecraft_uuid: body.uuid }, { onConflict: 'minecraft_uuid', ignoreDuplicates: true });

  // Get current skills
  const { data: skills } = await supabase
    .schema('nyang')
    .from('mc_player_skills')
    .select('*')
    .eq('minecraft_uuid', body.uuid)
    .single();

  if (!skills) {
    return NextResponse.json({ error: 'SKILL_DATA_ERROR' }, { status: 500 });
  }

  if (skills.skill_points <= 0) {
    return NextResponse.json({ error: 'NO_SKILL_POINTS' }, { status: 400 });
  }

  const currentLevel = (skills as Record<string, unknown>)[column] as number;
  if (currentLevel >= maxLevel) {
    return NextResponse.json({ error: 'MAX_LEVEL' }, { status: 400 });
  }

  // Check job level requirement
  const levelReqs = SKILL_LEVEL_REQ[body.skill] ?? [];
  const requiredLevel = levelReqs[currentLevel] ?? 1;

  const { data: jobData2 } = await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .select('level')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  const playerLevel = jobData2?.level ?? 1;
  if (playerLevel < requiredLevel) {
    return NextResponse.json({ error: 'LEVEL_TOO_LOW', required: requiredLevel, current: playerLevel }, { status: 400 });
  }

  // Deduct 1 skill point and increment skill level
  const { error } = await supabase
    .schema('nyang')
    .from('mc_player_skills')
    .update({
      skill_points: skills.skill_points - 1,
      [column]: currentLevel + 1,
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('minecraft_uuid', body.uuid);

  if (error) {
    return NextResponse.json({ error: 'UPDATE_FAILED' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    newLevel: currentLevel + 1,
    skillPoints: skills.skill_points - 1,
  });
}
