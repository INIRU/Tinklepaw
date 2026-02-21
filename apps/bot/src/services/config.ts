import { z } from 'zod';

import { getBotContext } from '../context.js';

const AppConfigSchema = z.object({
  join_message_template: z.string().nullable().optional(),
  join_message_channel_id: z.string().nullable().optional(),
  music_command_channel_id: z.string().nullable().optional(),
  music_setup_embed_title: z.string().nullable().optional(),
  music_setup_embed_description: z.string().nullable().optional(),
  music_setup_embed_fields: z
    .array(
      z.object({
        name: z.string(),
        value: z.string(),
        inline: z.boolean().optional()
      })
    )
    .nullable()
    .optional(),
  music_setup_message_id: z.string().nullable().optional(),
  bot_avatar_url: z.string().nullable().optional(),
  bot_sync_interval_ms: z.number().default(5000),
  stock_market_maker_interval_ms: z.number().nullable().optional(),
  gacha_embed_color: z.string().default('#5865F2'),
  gacha_embed_title: z.string().default('🎰 가챠 뽑기'),
  gacha_embed_description: z.string().nullable().optional(),
  gacha_processing_title: z.string().default('🎲 뽑는 중...'),
  gacha_processing_description: z.string().default('{drawCount}회 뽑기를 진행하고 있습니다...'),
  gacha_result_title: z.string().default('🎉 {drawCount}회 뽑기 결과'),
  reward_points_per_interval: z.number().default(0),
  reward_interval_seconds: z.number().default(60),
  reward_daily_cap_points: z.number().nullable().optional(),
  reward_min_message_length: z.number().default(0),
  booster_chat_bonus_points: z.number().default(0),
  voice_reward_points_per_interval: z.number().default(0),
  voice_reward_interval_seconds: z.number().default(60),
  voice_reward_daily_cap_points: z.number().nullable().optional(),
  booster_voice_bonus_points: z.number().default(0),
  voice_interface_trigger_channel_id: z.string().nullable().optional(),
  voice_interface_category_id: z.string().nullable().optional(),
  error_log_channel_id: z.string().nullable().optional(),
  maintenance_mode_enabled: z.boolean().default(false),
  maintenance_mode_reason: z.string().nullable().optional(),
  maintenance_mode_until: z.string().nullable().optional(),
  maintenance_bot_target_commands: z.array(z.string()).default([]),
  stock_news_enabled: z.boolean().default(false),
  stock_news_channel_id: z.string().nullable().optional(),
  stock_news_schedule_mode: z.enum(['interval', 'daily_random']).default('interval'),
  stock_news_interval_minutes: z.number().default(60),
  stock_news_daily_window_start_hour: z.number().default(9),
  stock_news_daily_window_end_hour: z.number().default(23),
  stock_news_bullish_min_impact_bps: z.number().default(40),
  stock_news_bullish_max_impact_bps: z.number().default(260),
  stock_news_bearish_min_impact_bps: z.number().default(40),
  stock_news_bearish_max_impact_bps: z.number().default(260),
  stock_news_bullish_scenarios: z.array(z.string()).default([
    '차세대 제품 쇼케이스 기대감 확산',
    '대형 파트너십 체결 루머 확산',
    '핵심 엔지니어 팀 합류 소식',
    '기관성 매수세 유입 추정',
    '해외 커뮤니티에서 기술력 재평가'
  ]),
  stock_news_bearish_scenarios: z.array(z.string()).default([
    '생산 라인 점검 이슈 부각',
    '핵심 부품 수급 지연 우려 확대',
    '경영진 발언 해석 논란 확산',
    '단기 차익 실현 물량 집중',
    '경쟁사 공세 심화 관측'
  ]),
  stock_news_last_sent_at: z.string().nullable().optional(),
  stock_news_next_run_at: z.string().nullable().optional(),
  stock_news_force_run_at: z.string().nullable().optional(),
  stock_news_force_sentiment: z.enum(['bullish', 'bearish', 'neutral']).nullable().optional(),
  stock_news_force_tier: z.enum(['general', 'rare', 'shock']).nullable().optional(),
  stock_news_force_scenario: z.string().nullable().optional(),
  show_traceback_to_user: z.boolean().default(true)
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

let cached: { value: AppConfig; at: number } | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  const now = Date.now();
  if (cached && now - cached.at < (cached.value.bot_sync_interval_ms || 5000)) return cached.value;

  const ctx = getBotContext();
  const { data, error } = await ctx.supabase
    .from('app_config')
    .select('join_message_template, join_message_channel_id, music_command_channel_id, music_setup_embed_title, music_setup_embed_description, music_setup_embed_fields, music_setup_message_id, bot_avatar_url, bot_sync_interval_ms, stock_market_maker_interval_ms, gacha_embed_color, gacha_embed_title, gacha_embed_description, gacha_processing_title, gacha_processing_description, gacha_result_title, reward_points_per_interval, reward_interval_seconds, reward_daily_cap_points, reward_min_message_length, booster_chat_bonus_points, voice_reward_points_per_interval, voice_reward_interval_seconds, voice_reward_daily_cap_points, booster_voice_bonus_points, voice_interface_trigger_channel_id, voice_interface_category_id, error_log_channel_id, maintenance_mode_enabled, maintenance_mode_reason, maintenance_mode_until, maintenance_bot_target_commands, stock_news_enabled, stock_news_channel_id, stock_news_schedule_mode, stock_news_interval_minutes, stock_news_daily_window_start_hour, stock_news_daily_window_end_hour, stock_news_bullish_min_impact_bps, stock_news_bullish_max_impact_bps, stock_news_bearish_min_impact_bps, stock_news_bearish_max_impact_bps, stock_news_bullish_scenarios, stock_news_bearish_scenarios, stock_news_last_sent_at, stock_news_next_run_at, stock_news_force_run_at, stock_news_force_sentiment, stock_news_force_tier, stock_news_force_scenario, show_traceback_to_user')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  const parsed = AppConfigSchema.safeParse(data ?? {});
  const value = parsed.success ? parsed.data : {
    bot_sync_interval_ms: 5000,
    stock_market_maker_interval_ms: null,
    gacha_embed_color: '#5865F2',
    gacha_embed_title: '🎰 가챠 뽑기',
    gacha_embed_description: null,
    gacha_processing_title: '🎲 뽑는 중...',
    gacha_processing_description: '{drawCount}회 뽑기를 진행하고 있습니다...',
    gacha_result_title: '🎉 {drawCount}회 뽑기 결과',
    reward_points_per_interval: 0,
    reward_interval_seconds: 60,
    reward_daily_cap_points: null,
    reward_min_message_length: 0,
    booster_chat_bonus_points: 0,
    voice_reward_points_per_interval: 0,
    voice_reward_interval_seconds: 60,
    voice_reward_daily_cap_points: null,
    booster_voice_bonus_points: 0,
    voice_interface_trigger_channel_id: null,
    voice_interface_category_id: null,
    music_command_channel_id: null,
    music_setup_embed_title: null,
    music_setup_embed_description: null,
     music_setup_embed_fields: null,
      music_setup_message_id: null,
      error_log_channel_id: null,
       maintenance_mode_enabled: false,
       maintenance_mode_reason: null,
       maintenance_mode_until: null,
       maintenance_bot_target_commands: [],
       stock_news_enabled: false,
      stock_news_channel_id: null,
      stock_news_schedule_mode: 'interval' as const,
      stock_news_interval_minutes: 60,
      stock_news_daily_window_start_hour: 9,
      stock_news_daily_window_end_hour: 23,
      stock_news_bullish_min_impact_bps: 40,
      stock_news_bullish_max_impact_bps: 260,
      stock_news_bearish_min_impact_bps: 40,
      stock_news_bearish_max_impact_bps: 260,
      stock_news_bullish_scenarios: [
        '차세대 제품 쇼케이스 기대감 확산',
        '대형 파트너십 체결 루머 확산',
        '핵심 엔지니어 팀 합류 소식',
        '기관성 매수세 유입 추정',
        '해외 커뮤니티에서 기술력 재평가'
      ],
      stock_news_bearish_scenarios: [
        '생산 라인 점검 이슈 부각',
        '핵심 부품 수급 지연 우려 확대',
        '경영진 발언 해석 논란 확산',
        '단기 차익 실현 물량 집중',
        '경쟁사 공세 심화 관측'
      ],
      stock_news_last_sent_at: null,
      stock_news_next_run_at: null,
      stock_news_force_run_at: null,
      stock_news_force_sentiment: null,
      stock_news_force_tier: null,
      stock_news_force_scenario: null,
      show_traceback_to_user: true
  };
  cached = { value, at: now };
  return value;
}

export function invalidateAppConfigCache(): void {
  cached = null;
}
