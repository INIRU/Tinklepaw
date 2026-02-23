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
    const currentCfg = await getOrInitAppConfig();

    const body = (await req.json()) as {
    server_intro?: string | null;
    banner_image_url?: string | null;
    icon_image_url?: string | null;
    join_message_template?: string | null;
    join_message_channel_id?: string | null;
    maintenance_mode_enabled?: boolean;
    maintenance_mode_reason?: string | null;
    maintenance_mode_until?: string | null;
    maintenance_web_target_paths?: string[];
    maintenance_bot_target_commands?: string[];
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
    duplicate_ss_tuna_energy?: number;
    duplicate_sss_tuna_energy?: number;
    voice_interface_trigger_channel_id?: string | null;
    voice_interface_category_id?: string | null;
    lottery_jackpot_rate_pct?: number;
    lottery_gold_rate_pct?: number;
    lottery_silver_rate_pct?: number;
    lottery_bronze_rate_pct?: number;
    lottery_ticket_cooldown_seconds?: number;
    lottery_ticket_price?: number;
    lottery_jackpot_base_points?: number;
    lottery_gold_payout_points?: number;
    lottery_silver_payout_points?: number;
    lottery_bronze_payout_points?: number;
    lottery_jackpot_pool_points?: number;
    lottery_activity_jackpot_rate_pct?: number;
    stock_news_enabled?: boolean;
    stock_news_channel_id?: string | null;
    stock_news_schedule_mode?: 'interval' | 'daily_random';
    stock_news_interval_minutes?: number;
    stock_news_signal_duration_rumor_minutes?: number;
    stock_news_signal_duration_mixed_minutes?: number;
    stock_news_signal_duration_confirmed_minutes?: number;
    stock_news_signal_duration_reversal_minutes?: number;
    stock_news_signal_duration_max_minutes?: number;
    stock_news_daily_window_start_hour?: number;
    stock_news_daily_window_end_hour?: number;
    stock_news_bullish_min_impact_bps?: number;
    stock_news_bullish_max_impact_bps?: number;
    stock_news_bearish_min_impact_bps?: number;
    stock_news_bearish_max_impact_bps?: number;
    stock_news_min_impact_bps?: number;
    stock_news_max_impact_bps?: number;
    stock_whale_max_buy_qty?: number;
    stock_whale_max_sell_qty?: number;
    stock_shrimp_max_buy_qty?: number;
    stock_shrimp_max_sell_qty?: number;
    stock_ant_auto_buy_qty?: number;
    stock_ant_auto_buy_cooldown_seconds?: number;
    stock_market_maker_interval_ms?: number | null;
    stock_holding_fee_enabled?: boolean;
    stock_holding_fee_daily_bps?: number;
    stock_holding_fee_daily_cap_bps?: number;
    stock_holding_fee_timezone?: string | null;
    stock_news_bullish_scenarios?: string[];
    stock_news_bearish_scenarios?: string[];
  };

    const normalizeScenarioList = (input: string[] | undefined) => {
      if (!Array.isArray(input)) return undefined;
      return input.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 64);
    };

    const normalizePathTargets = (input: string[] | undefined) => {
      if (!Array.isArray(input)) return undefined;
      const normalized = input
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .map((item) => (item.startsWith('/') ? item : `/${item}`))
        .map((item) => (item === '/' ? item : item.replace(/\/+$/, '')))
        .slice(0, 128);
      return Array.from(new Set(normalized));
    };

    const normalizeCommandTargets = (input: string[] | undefined) => {
      if (!Array.isArray(input)) return undefined;
      const normalized = input
        .map((item) => String(item ?? '').trim().toLowerCase())
        .map((item) => item.replace(/^\/+/, ''))
        .map((item) => item.replace(/[^a-z0-9_-]/g, ''))
        .filter(Boolean)
        .slice(0, 128);
      return Array.from(new Set(normalized));
    };

    const patch: Record<string, unknown> = {};
    const currentCfgAny = currentCfg as Record<string, unknown>;

    if (body.server_intro !== undefined) {
      const v = typeof body.server_intro === 'string' ? body.server_intro : null;
      patch.server_intro = v && v.trim().length ? v : null;
    }
    if (body.banner_image_url !== undefined) patch.banner_image_url = body.banner_image_url ?? null;
    if (body.icon_image_url !== undefined) patch.icon_image_url = body.icon_image_url ?? null;
    if (body.join_message_template !== undefined) patch.join_message_template = body.join_message_template ?? null;
    if (body.join_message_channel_id !== undefined) patch.join_message_channel_id = body.join_message_channel_id ?? null;
    if (body.maintenance_mode_enabled !== undefined) {
      patch.maintenance_mode_enabled = Boolean(body.maintenance_mode_enabled);
    }
    if (body.maintenance_mode_reason !== undefined) {
      const raw = typeof body.maintenance_mode_reason === 'string' ? body.maintenance_mode_reason.trim() : '';
      patch.maintenance_mode_reason = raw.length > 0 ? raw.slice(0, 500) : null;
    }
    if (body.maintenance_mode_until !== undefined) {
      if (!body.maintenance_mode_until) {
        patch.maintenance_mode_until = null;
      } else {
        const atMs = Date.parse(body.maintenance_mode_until);
        patch.maintenance_mode_until = Number.isFinite(atMs) ? new Date(atMs).toISOString() : null;
      }
    }
    const maintenanceWebTargets = normalizePathTargets(body.maintenance_web_target_paths);
    if (maintenanceWebTargets !== undefined) {
      patch.maintenance_web_target_paths = maintenanceWebTargets;
    }
    const maintenanceBotTargets = normalizeCommandTargets(body.maintenance_bot_target_commands);
    if (maintenanceBotTargets !== undefined) {
      patch.maintenance_bot_target_commands = maintenanceBotTargets;
    }
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
    if (body.duplicate_ss_tuna_energy !== undefined) patch.duplicate_ss_tuna_energy = body.duplicate_ss_tuna_energy;
    if (body.duplicate_sss_tuna_energy !== undefined) patch.duplicate_sss_tuna_energy = body.duplicate_sss_tuna_energy;
    if (body.voice_interface_trigger_channel_id !== undefined) patch.voice_interface_trigger_channel_id = body.voice_interface_trigger_channel_id ?? null;
    if (body.voice_interface_category_id !== undefined) patch.voice_interface_category_id = body.voice_interface_category_id ?? null;
    if (body.lottery_jackpot_rate_pct !== undefined) patch.lottery_jackpot_rate_pct = body.lottery_jackpot_rate_pct;
    if (body.lottery_gold_rate_pct !== undefined) patch.lottery_gold_rate_pct = body.lottery_gold_rate_pct;
    if (body.lottery_silver_rate_pct !== undefined) patch.lottery_silver_rate_pct = body.lottery_silver_rate_pct;
    if (body.lottery_bronze_rate_pct !== undefined) patch.lottery_bronze_rate_pct = body.lottery_bronze_rate_pct;
    if (body.lottery_ticket_cooldown_seconds !== undefined) patch.lottery_ticket_cooldown_seconds = body.lottery_ticket_cooldown_seconds;
    if (body.lottery_ticket_price !== undefined) patch.lottery_ticket_price = body.lottery_ticket_price;
    if (body.lottery_jackpot_base_points !== undefined) patch.lottery_jackpot_base_points = body.lottery_jackpot_base_points;
    if (body.lottery_gold_payout_points !== undefined) patch.lottery_gold_payout_points = body.lottery_gold_payout_points;
    if (body.lottery_silver_payout_points !== undefined) patch.lottery_silver_payout_points = body.lottery_silver_payout_points;
    if (body.lottery_bronze_payout_points !== undefined) patch.lottery_bronze_payout_points = body.lottery_bronze_payout_points;
    if (body.lottery_jackpot_pool_points !== undefined) patch.lottery_jackpot_pool_points = body.lottery_jackpot_pool_points;
    if (body.lottery_activity_jackpot_rate_pct !== undefined) patch.lottery_activity_jackpot_rate_pct = body.lottery_activity_jackpot_rate_pct;
    if (body.stock_news_enabled !== undefined) patch.stock_news_enabled = Boolean(body.stock_news_enabled);
    if (body.stock_news_channel_id !== undefined) patch.stock_news_channel_id = body.stock_news_channel_id ?? null;
    if (body.stock_news_schedule_mode !== undefined) {
      patch.stock_news_schedule_mode = body.stock_news_schedule_mode === 'daily_random' ? 'daily_random' : 'interval';
    }
    if (body.stock_news_interval_minutes !== undefined) {
      patch.stock_news_interval_minutes = Math.max(5, Math.min(1440, Math.floor(body.stock_news_interval_minutes)));
    }
    if (body.stock_news_signal_duration_rumor_minutes !== undefined) {
      patch.stock_news_signal_duration_rumor_minutes = Math.max(5, Math.min(360, Math.floor(body.stock_news_signal_duration_rumor_minutes)));
    }
    if (body.stock_news_signal_duration_mixed_minutes !== undefined) {
      patch.stock_news_signal_duration_mixed_minutes = Math.max(5, Math.min(360, Math.floor(body.stock_news_signal_duration_mixed_minutes)));
    }
    if (body.stock_news_signal_duration_confirmed_minutes !== undefined) {
      patch.stock_news_signal_duration_confirmed_minutes = Math.max(5, Math.min(360, Math.floor(body.stock_news_signal_duration_confirmed_minutes)));
    }
    if (body.stock_news_signal_duration_reversal_minutes !== undefined) {
      patch.stock_news_signal_duration_reversal_minutes = Math.max(5, Math.min(180, Math.floor(body.stock_news_signal_duration_reversal_minutes)));
    }
    if (body.stock_news_signal_duration_max_minutes !== undefined) {
      patch.stock_news_signal_duration_max_minutes = Math.max(5, Math.min(720, Math.floor(body.stock_news_signal_duration_max_minutes)));
    }
    if (body.stock_news_daily_window_start_hour !== undefined) {
      patch.stock_news_daily_window_start_hour = Math.max(0, Math.min(23, Math.floor(body.stock_news_daily_window_start_hour)));
    }
    if (body.stock_news_daily_window_end_hour !== undefined) {
      patch.stock_news_daily_window_end_hour = Math.max(0, Math.min(23, Math.floor(body.stock_news_daily_window_end_hour)));
    }
    const legacyMinImpact =
      body.stock_news_min_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_min_impact_bps)))
        : undefined;
    const legacyMaxImpact =
      body.stock_news_max_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_max_impact_bps)))
        : undefined;

    const bullishMinImpact =
      body.stock_news_bullish_min_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_bullish_min_impact_bps)))
        : legacyMinImpact;
    const bullishMaxImpact =
      body.stock_news_bullish_max_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_bullish_max_impact_bps)))
        : legacyMaxImpact;
    const bearishMinImpact =
      body.stock_news_bearish_min_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_bearish_min_impact_bps)))
        : legacyMinImpact;
    const bearishMaxImpact =
      body.stock_news_bearish_max_impact_bps !== undefined
        ? Math.max(0, Math.min(5000, Math.floor(body.stock_news_bearish_max_impact_bps)))
        : legacyMaxImpact;

    if (bullishMinImpact !== undefined) patch.stock_news_bullish_min_impact_bps = bullishMinImpact;
    if (bullishMaxImpact !== undefined) patch.stock_news_bullish_max_impact_bps = bullishMaxImpact;
    if (bullishMinImpact !== undefined && bullishMaxImpact !== undefined && bullishMaxImpact < bullishMinImpact) {
      patch.stock_news_bullish_max_impact_bps = bullishMinImpact;
    }

    if (bearishMinImpact !== undefined) patch.stock_news_bearish_min_impact_bps = bearishMinImpact;
    if (bearishMaxImpact !== undefined) patch.stock_news_bearish_max_impact_bps = bearishMaxImpact;
    if (bearishMinImpact !== undefined && bearishMaxImpact !== undefined && bearishMaxImpact < bearishMinImpact) {
      patch.stock_news_bearish_max_impact_bps = bearishMinImpact;
    }

    if (body.stock_whale_max_buy_qty !== undefined) {
      patch.stock_whale_max_buy_qty = Math.max(1, Math.min(5000, Math.floor(body.stock_whale_max_buy_qty)));
    }
    if (body.stock_whale_max_sell_qty !== undefined) {
      patch.stock_whale_max_sell_qty = Math.max(1, Math.min(5000, Math.floor(body.stock_whale_max_sell_qty)));
    }
    if (body.stock_shrimp_max_buy_qty !== undefined) {
      patch.stock_shrimp_max_buy_qty = Math.max(1, Math.min(1000, Math.floor(body.stock_shrimp_max_buy_qty)));
    }
    if (body.stock_shrimp_max_sell_qty !== undefined) {
      patch.stock_shrimp_max_sell_qty = Math.max(1, Math.min(1000, Math.floor(body.stock_shrimp_max_sell_qty)));
    }
    if (body.stock_ant_auto_buy_qty !== undefined) {
      patch.stock_ant_auto_buy_qty = Math.max(1, Math.min(500, Math.floor(body.stock_ant_auto_buy_qty)));
    }
    if (body.stock_market_maker_interval_ms !== undefined) {
      if (body.stock_market_maker_interval_ms === null) {
        patch.stock_market_maker_interval_ms = null;
      } else {
        patch.stock_market_maker_interval_ms = Math.max(5000, Math.min(300000, Math.floor(body.stock_market_maker_interval_ms)));
      }
    }
    const effectiveMakerIntervalMs = Number(
      patch.stock_market_maker_interval_ms
      ?? currentCfgAny.stock_market_maker_interval_ms
      ?? currentCfgAny.bot_sync_interval_ms
      ?? 30000
    );
    patch.stock_ant_auto_buy_cooldown_seconds = Math.max(
      10,
      Math.min(3600, Math.round((effectiveMakerIntervalMs / 1000) * 4))
    );
    if (body.stock_holding_fee_enabled !== undefined) {
      patch.stock_holding_fee_enabled = Boolean(body.stock_holding_fee_enabled);
    }
    if (body.stock_holding_fee_daily_bps !== undefined) {
      patch.stock_holding_fee_daily_bps = Math.max(1, Math.min(1000, Math.floor(body.stock_holding_fee_daily_bps)));
    }
    if (body.stock_holding_fee_daily_cap_bps !== undefined) {
      patch.stock_holding_fee_daily_cap_bps = Math.max(1, Math.min(2000, Math.floor(body.stock_holding_fee_daily_cap_bps)));
    }
    const effectiveDailyBps = Number(
      patch.stock_holding_fee_daily_bps
      ?? currentCfgAny.stock_holding_fee_daily_bps
      ?? 8
    );
    const effectiveCapBps = Number(
      patch.stock_holding_fee_daily_cap_bps
      ?? currentCfgAny.stock_holding_fee_daily_cap_bps
      ?? 20
    );
    if (effectiveCapBps < effectiveDailyBps) {
      patch.stock_holding_fee_daily_cap_bps = effectiveDailyBps;
    }
    if (body.stock_holding_fee_timezone !== undefined) {
      const tz = typeof body.stock_holding_fee_timezone === 'string' ? body.stock_holding_fee_timezone.trim() : '';
      patch.stock_holding_fee_timezone = tz.length > 0 ? tz.slice(0, 64) : 'Asia/Seoul';
    }

    const effectiveSignalRumor = Number(
      patch.stock_news_signal_duration_rumor_minutes
      ?? currentCfgAny.stock_news_signal_duration_rumor_minutes
      ?? 15
    );
    const effectiveSignalMixed = Number(
      patch.stock_news_signal_duration_mixed_minutes
      ?? currentCfgAny.stock_news_signal_duration_mixed_minutes
      ?? 35
    );
    const effectiveSignalConfirmed = Number(
      patch.stock_news_signal_duration_confirmed_minutes
      ?? currentCfgAny.stock_news_signal_duration_confirmed_minutes
      ?? 60
    );
    const effectiveSignalReversal = Number(
      patch.stock_news_signal_duration_reversal_minutes
      ?? currentCfgAny.stock_news_signal_duration_reversal_minutes
      ?? 12
    );
    const effectiveSignalMax = Number(
      patch.stock_news_signal_duration_max_minutes
      ?? currentCfgAny.stock_news_signal_duration_max_minutes
      ?? 180
    );
    const requiredSignalMax = Math.max(
      effectiveSignalRumor,
      effectiveSignalMixed,
      effectiveSignalConfirmed,
      effectiveSignalReversal,
    );
    if (effectiveSignalMax < requiredSignalMax) {
      patch.stock_news_signal_duration_max_minutes = requiredSignalMax;
    }

    const bullishScenarios = normalizeScenarioList(body.stock_news_bullish_scenarios);
    const bearishScenarios = normalizeScenarioList(body.stock_news_bearish_scenarios);
    if (bullishScenarios !== undefined) patch.stock_news_bullish_scenarios = bullishScenarios;
    if (bearishScenarios !== undefined) patch.stock_news_bearish_scenarios = bearishScenarios;

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
