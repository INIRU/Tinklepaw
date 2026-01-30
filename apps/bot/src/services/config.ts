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
  error_log_channel_id: z.string().nullable().optional(),
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
    .select('join_message_template, join_message_channel_id, music_command_channel_id, music_setup_embed_title, music_setup_embed_description, music_setup_embed_fields, music_setup_message_id, bot_avatar_url, bot_sync_interval_ms, gacha_embed_color, gacha_embed_title, gacha_embed_description, gacha_processing_title, gacha_processing_description, gacha_result_title, reward_points_per_interval, reward_interval_seconds, reward_daily_cap_points, reward_min_message_length, booster_chat_bonus_points, voice_reward_points_per_interval, voice_reward_interval_seconds, voice_reward_daily_cap_points, booster_voice_bonus_points, error_log_channel_id, show_traceback_to_user')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  const parsed = AppConfigSchema.safeParse(data ?? {});
  const value = parsed.success ? parsed.data : {
    bot_sync_interval_ms: 5000,
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
    music_command_channel_id: null,
    music_setup_embed_title: null,
    music_setup_embed_description: null,
    music_setup_embed_fields: null,
    music_setup_message_id: null,
    error_log_channel_id: null,
    show_traceback_to_user: true
  };
  cached = { value, at: now };
  return value;
}

export function invalidateAppConfigCache(): void {
  cached = null;
}
