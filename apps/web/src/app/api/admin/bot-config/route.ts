import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('app_config')
    .select(`
      persona_prompt, reward_emoji_enabled, bot_sync_interval_ms, 
      gacha_embed_color, gacha_embed_title, gacha_embed_description, 
      gacha_processing_title, gacha_processing_description, gacha_result_title, 
      inventory_embed_title, inventory_embed_color, inventory_embed_description,
      help_embed_title, help_embed_color, help_embed_description, help_embed_fields,
      help_embed_footer_text, help_embed_show_timestamp,
      music_setup_embed_title, music_setup_embed_description, music_setup_embed_fields,
      error_log_channel_id, show_traceback_to_user, last_heartbeat_at
    `)
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[Bot config load error][${requestId}]`, error);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR', code: 'APP_CONFIG_LOAD_FAILED', requestId }, { status: 500 });
  }
  
  // Check if config exists, if not create default
  if (!data) {
    const defaultBotConfig = { 
      persona_prompt: null, 
      reward_emoji_enabled: true,
      bot_sync_interval_ms: 5000,
      gacha_embed_color: '#5865F2',
      gacha_embed_title: '🎰 가챠 뽑기',
      gacha_embed_description: '현재 포인트: **{points}p**\n1회 뽑기 비용: **{cost1}p**\n10회 뽑기 비용: **{cost10}p**{pity}\n\n**확률표 & 획득 가능 역할**\n{rarityDisplay}',
      gacha_processing_title: '🎲 뽑는 중...',
      gacha_processing_description: '{drawCount}회 뽑기를 진행하고 있습니다...',
      gacha_result_title: '🎉 {drawCount}회 뽑기 결과',
      music_setup_embed_title: '🎶 음악 채널 설정 완료',
      music_setup_embed_description: '이 채널({channel})이 음악 명령어 채널로 설정되었습니다.',
      music_setup_embed_fields: [],
      error_log_channel_id: null,
      show_traceback_to_user: true,
      last_heartbeat_at: null
    };
    return NextResponse.json({ ...defaultBotConfig, bot_online: false, heartbeat_age_ms: null });
  }

  const now = Date.now();
  const last = data.last_heartbeat_at ? new Date(data.last_heartbeat_at).getTime() : null;
  const ageMs = last ? Math.max(0, now - last) : null;
  const bot_online = ageMs !== null && ageMs < 30000;
  
  return NextResponse.json({ ...data, bot_online, heartbeat_age_ms: ageMs });
}

export async function PUT(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = (await req.json()) as { 
    persona_prompt?: string; 
    reward_emoji_enabled?: boolean;
    bot_sync_interval_ms?: number;
    gacha_embed_color?: string;
    gacha_embed_title?: string;
    gacha_embed_description?: string;
    gacha_processing_title?: string;
    gacha_processing_description?: string;
    gacha_result_title?: string;
    inventory_embed_title?: string;
    inventory_embed_color?: string;
    inventory_embed_description?: string;
    help_embed_title?: string;
    help_embed_color?: string;
    help_embed_description?: string;
    help_embed_fields?: Array<{ name: string; value: string; inline?: boolean }> | null;
    help_embed_footer_text?: string;
    help_embed_show_timestamp?: boolean;
    music_setup_embed_title?: string;
    music_setup_embed_description?: string;
    music_setup_embed_fields?: Array<{ name: string; value: string; inline?: boolean }> | null;
    error_log_channel_id?: string | null;
    show_traceback_to_user?: boolean;
  };
  const supabase = createSupabaseAdminClient();

  const patch: Record<string, unknown> = {};
  if (body.persona_prompt !== undefined) patch.persona_prompt = body.persona_prompt;
  if (body.reward_emoji_enabled !== undefined) patch.reward_emoji_enabled = body.reward_emoji_enabled;
  if (body.bot_sync_interval_ms !== undefined) patch.bot_sync_interval_ms = body.bot_sync_interval_ms;
  if (body.gacha_embed_color !== undefined) patch.gacha_embed_color = body.gacha_embed_color;
  if (body.gacha_embed_title !== undefined) patch.gacha_embed_title = body.gacha_embed_title;
  if (body.gacha_embed_description !== undefined) patch.gacha_embed_description = body.gacha_embed_description;
  if (body.gacha_processing_title !== undefined) patch.gacha_processing_title = body.gacha_processing_title;
  if (body.gacha_processing_description !== undefined) patch.gacha_processing_description = body.gacha_processing_description;
  if (body.gacha_result_title !== undefined) patch.gacha_result_title = body.gacha_result_title;
  if (body.inventory_embed_title !== undefined) patch.inventory_embed_title = body.inventory_embed_title;
  if (body.inventory_embed_color !== undefined) patch.inventory_embed_color = body.inventory_embed_color;
  if (body.inventory_embed_description !== undefined) patch.inventory_embed_description = body.inventory_embed_description;
  if (body.help_embed_title !== undefined) patch.help_embed_title = body.help_embed_title;
  if (body.help_embed_color !== undefined) patch.help_embed_color = body.help_embed_color;
  if (body.help_embed_description !== undefined) patch.help_embed_description = body.help_embed_description;
  if (body.help_embed_fields !== undefined) patch.help_embed_fields = body.help_embed_fields;
  if (body.help_embed_footer_text !== undefined) patch.help_embed_footer_text = body.help_embed_footer_text;
  if (body.help_embed_show_timestamp !== undefined) patch.help_embed_show_timestamp = body.help_embed_show_timestamp;
  if (body.music_setup_embed_title !== undefined) patch.music_setup_embed_title = body.music_setup_embed_title;
  if (body.music_setup_embed_description !== undefined) patch.music_setup_embed_description = body.music_setup_embed_description;
  if (body.music_setup_embed_fields !== undefined) patch.music_setup_embed_fields = body.music_setup_embed_fields;
  if (body.error_log_channel_id !== undefined) patch.error_log_channel_id = body.error_log_channel_id;
  if (body.show_traceback_to_user !== undefined) patch.show_traceback_to_user = body.show_traceback_to_user;

  const { data, error } = await supabase
    .from('app_config')
    .update(patch)
    .eq('id', 1)
    .select(`
      persona_prompt, reward_emoji_enabled, bot_sync_interval_ms, 
      gacha_embed_color, gacha_embed_title, gacha_embed_description, 
      gacha_processing_title, gacha_processing_description, gacha_result_title, 
      inventory_embed_title, inventory_embed_color, inventory_embed_description,
      help_embed_title, help_embed_color, help_embed_description, help_embed_fields,
      help_embed_footer_text, help_embed_show_timestamp,
      music_setup_embed_title, music_setup_embed_description, music_setup_embed_fields,
      error_log_channel_id, show_traceback_to_user, last_heartbeat_at
    `)
    .single();

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[Bot config update error][${requestId}]`, error);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR', code: 'APP_CONFIG_UPDATE_FAILED', requestId }, { status: 500 });
  }
  return NextResponse.json(data);
}
