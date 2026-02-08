import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;
    const cfg = await getOrInitAppConfig();
    return NextResponse.json(cfg);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load config';
    console.error('[AdminConfig] GET failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;

    // Ensure the singleton row exists before updating.
    await getOrInitAppConfig();

  const body = (await req.json()) as {
    server_intro?: string | null;
    banner_image_url?: string | null;
    icon_image_url?: string | null;
    join_message_template?: string | null;
    join_message_channel_id?: string | null;
    reward_points_per_interval?: number;
    reward_interval_seconds?: number;
    reward_daily_cap_points?: number | null;
    reward_min_message_length?: number;
    voice_reward_points_per_interval?: number;
    voice_reward_interval_seconds?: number;
    voice_reward_daily_cap_points?: number | null;
    booster_chat_bonus_points?: number;
    booster_voice_bonus_points?: number;
    daily_chest_legendary_rate_pct?: number;
    daily_chest_epic_rate_pct?: number;
    daily_chest_rare_rate_pct?: number;
    daily_chest_common_min_points?: number;
    daily_chest_common_max_points?: number;
    daily_chest_rare_min_points?: number;
    daily_chest_rare_max_points?: number;
    daily_chest_epic_min_points?: number;
    daily_chest_epic_max_points?: number;
    daily_chest_legendary_min_points?: number;
    daily_chest_legendary_max_points?: number;
    daily_chest_item_drop_rate_pct?: number;
  };

  const patch: Record<string, unknown> = {};

  if (body.server_intro !== undefined) {
    const v = typeof body.server_intro === 'string' ? body.server_intro : null;
    patch.server_intro = v && v.trim().length ? v : null;
  }
  if (body.banner_image_url !== undefined) patch.banner_image_url = body.banner_image_url ?? null;
  if (body.icon_image_url !== undefined) patch.icon_image_url = body.icon_image_url ?? null;
  if (body.join_message_template !== undefined) patch.join_message_template = body.join_message_template ?? null;
  if (body.join_message_channel_id !== undefined) patch.join_message_channel_id = body.join_message_channel_id ?? null;
  if (body.reward_points_per_interval !== undefined) patch.reward_points_per_interval = body.reward_points_per_interval;
  if (body.reward_interval_seconds !== undefined) patch.reward_interval_seconds = body.reward_interval_seconds;
  if (body.reward_daily_cap_points !== undefined) patch.reward_daily_cap_points = body.reward_daily_cap_points ?? null;
  if (body.reward_min_message_length !== undefined) patch.reward_min_message_length = body.reward_min_message_length;
  if (body.voice_reward_points_per_interval !== undefined) patch.voice_reward_points_per_interval = body.voice_reward_points_per_interval;
  if (body.voice_reward_interval_seconds !== undefined) patch.voice_reward_interval_seconds = body.voice_reward_interval_seconds;
  if (body.voice_reward_daily_cap_points !== undefined) patch.voice_reward_daily_cap_points = body.voice_reward_daily_cap_points ?? null;
  if (body.booster_chat_bonus_points !== undefined) patch.booster_chat_bonus_points = body.booster_chat_bonus_points;
  if (body.booster_voice_bonus_points !== undefined) patch.booster_voice_bonus_points = body.booster_voice_bonus_points;
  if (body.daily_chest_legendary_rate_pct !== undefined) patch.daily_chest_legendary_rate_pct = body.daily_chest_legendary_rate_pct;
  if (body.daily_chest_epic_rate_pct !== undefined) patch.daily_chest_epic_rate_pct = body.daily_chest_epic_rate_pct;
  if (body.daily_chest_rare_rate_pct !== undefined) patch.daily_chest_rare_rate_pct = body.daily_chest_rare_rate_pct;
  if (body.daily_chest_common_min_points !== undefined) patch.daily_chest_common_min_points = body.daily_chest_common_min_points;
  if (body.daily_chest_common_max_points !== undefined) patch.daily_chest_common_max_points = body.daily_chest_common_max_points;
  if (body.daily_chest_rare_min_points !== undefined) patch.daily_chest_rare_min_points = body.daily_chest_rare_min_points;
  if (body.daily_chest_rare_max_points !== undefined) patch.daily_chest_rare_max_points = body.daily_chest_rare_max_points;
  if (body.daily_chest_epic_min_points !== undefined) patch.daily_chest_epic_min_points = body.daily_chest_epic_min_points;
  if (body.daily_chest_epic_max_points !== undefined) patch.daily_chest_epic_max_points = body.daily_chest_epic_max_points;
  if (body.daily_chest_legendary_min_points !== undefined) patch.daily_chest_legendary_min_points = body.daily_chest_legendary_min_points;
  if (body.daily_chest_legendary_max_points !== undefined) patch.daily_chest_legendary_max_points = body.daily_chest_legendary_max_points;
  if (body.daily_chest_item_drop_rate_pct !== undefined) patch.daily_chest_item_drop_rate_pct = body.daily_chest_item_drop_rate_pct;

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.from('app_config').update(patch).eq('id', 1).select('*').single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to update config';
    console.error('[AdminConfig] PUT failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
