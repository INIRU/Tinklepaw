import 'server-only';

import { createSupabaseAdminClient } from './supabase-admin';
import { getServerEnv } from './env';

export async function getOrInitAppConfig() {
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: selErr } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const env = getServerEnv();
  const { data: created, error: insErr } = await supabase
    .from('app_config')
    .insert({
      id: 1,
      guild_id: env.NYARU_GUILD_ID,
      admin_role_ids: [],
      reward_points_per_interval: 10,
      reward_interval_seconds: 180,
      reward_daily_cap_points: null,
      reward_min_message_length: 3,
      voice_reward_points_per_interval: 0,
      voice_reward_interval_seconds: 60,
      voice_reward_daily_cap_points: null,
      booster_chat_bonus_points: 0,
      booster_voice_bonus_points: 0,
      daily_chest_legendary_rate_pct: 3,
      daily_chest_epic_rate_pct: 15,
      daily_chest_rare_rate_pct: 30,
      daily_chest_common_min_points: 40,
      daily_chest_common_max_points: 110,
      daily_chest_rare_min_points: 90,
      daily_chest_rare_max_points: 200,
      daily_chest_epic_min_points: 180,
      daily_chest_epic_max_points: 360,
      daily_chest_legendary_min_points: 340,
      daily_chest_legendary_max_points: 620,
      daily_chest_item_drop_rate_pct: 12,
      duplicate_ss_tuna_energy: 3,
      duplicate_sss_tuna_energy: 5,
      voice_interface_trigger_channel_id: null,
      voice_interface_category_id: null,
      lottery_jackpot_rate_pct: 0.3,
      lottery_gold_rate_pct: 1.5,
      lottery_silver_rate_pct: 8,
      lottery_bronze_rate_pct: 20,
      lottery_ticket_cooldown_seconds: 60,
      lottery_ticket_price: 500,
      lottery_jackpot_base_points: 20000,
      lottery_gold_payout_points: 5000,
      lottery_silver_payout_points: 1500,
      lottery_bronze_payout_points: 700,
      lottery_jackpot_pool_points: 0,
      lottery_activity_jackpot_rate_pct: 10,
      stock_whale_max_buy_qty: 320,
      stock_whale_max_sell_qty: 320,
      stock_shrimp_max_buy_qty: 28,
      stock_shrimp_max_sell_qty: 28,
      stock_ant_auto_buy_qty: 8,
      stock_ant_auto_buy_cooldown_seconds: 120,
      stock_news_bullish_min_impact_bps: 40,
      stock_news_bullish_max_impact_bps: 260,
      stock_news_bearish_min_impact_bps: 40,
      stock_news_bearish_max_impact_bps: 260,
    })
    .select('*')
    .single();

  if (insErr) throw insErr;
  return created;
}
