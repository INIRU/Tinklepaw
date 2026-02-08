// Minimal Supabase Database types for this repo.
// If you prefer fully generated types, run:
//   npx supabase gen types typescript --project-id <ref> > packages/core/src/supabase.types.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  nyang: {
    Tables: {
      app_config: {
        Row: {
          id: number;
          guild_id: string;
          admin_role_ids: string[];
          join_message_template: string | null;
          join_message_channel_id: string | null;
          persona_prompt: string | null;
          reward_emoji_enabled: boolean;
          bot_avatar_url: string | null;
          bot_sync_interval_ms: number;
          gacha_embed_color: string;
          gacha_embed_title: string;
          gacha_embed_description: string;
          gacha_processing_title: string;
          gacha_processing_description: string;
          gacha_result_title: string;
          inventory_embed_title: string | null;
          inventory_embed_color: string | null;
          inventory_embed_description: string | null;
          help_embed_title: string | null;
          help_embed_color: string | null;
          help_embed_description: string | null;
          help_embed_fields: Json | null;
          help_embed_footer_text: string | null;
          help_embed_show_timestamp: boolean | null;
          music_command_channel_id: string | null;
          music_setup_embed_title: string | null;
          music_setup_embed_description: string | null;
          music_setup_embed_fields: Json | null;
          music_setup_message_id: string | null;
          reward_points_per_interval: number;
          reward_interval_seconds: number;
          reward_daily_cap_points: number | null;
          reward_min_message_length: number;
          booster_chat_bonus_points: number;
          voice_reward_points_per_interval: number;
          voice_reward_interval_seconds: number;
          voice_reward_daily_cap_points: number | null;
          booster_voice_bonus_points: number;
          daily_chest_legendary_rate_pct: number;
          daily_chest_epic_rate_pct: number;
          daily_chest_rare_rate_pct: number;
          daily_chest_common_min_points: number;
          daily_chest_common_max_points: number;
          daily_chest_rare_min_points: number;
          daily_chest_rare_max_points: number;
          daily_chest_epic_min_points: number;
          daily_chest_epic_max_points: number;
          daily_chest_legendary_min_points: number;
          daily_chest_legendary_max_points: number;
          daily_chest_item_drop_rate_pct: number;
          lottery_jackpot_rate_pct: number;
          lottery_gold_rate_pct: number;
          lottery_silver_rate_pct: number;
          lottery_bronze_rate_pct: number;
          lottery_ticket_cooldown_seconds: number;
          server_intro: string | null;
          banner_image_url: string | null;
          icon_image_url: string | null;
          last_heartbeat_at: string | null;
          error_log_channel_id: string | null;
          show_traceback_to_user: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['app_config']['Row']> & {
          id: number;
          guild_id: string;
        };
        Update: Partial<Database['nyang']['Tables']['app_config']['Row']>;
        Relationships: [];
      };
      status_samples: {
        Row: {
          id: string;
          service: string;
          status: string;
          created_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['status_samples']['Row']> & {
          service: string;
          status: string;
        };
        Update: Partial<Database['nyang']['Tables']['status_samples']['Row']>;
        Relationships: [];
      };
      activity_events: {
        Row: {
          event_id: number;
          guild_id: string;
          user_id: string | null;
          event_type: string;
          value: number;
          meta: Json;
          created_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['activity_events']['Row']> & {
          guild_id: string;
          event_type: string;
        };
        Update: Partial<Database['nyang']['Tables']['activity_events']['Row']>;
        Relationships: [];
      };
      music_control_jobs: {
        Row: {
          job_id: string;
          guild_id: string;
          action: string;
          payload: Json;
          status: string;
          requested_by: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['music_control_jobs']['Row']> & {
          guild_id: string;
          action: string;
        };
        Update: Partial<Database['nyang']['Tables']['music_control_jobs']['Row']>;
        Relationships: [];
      };
      music_control_logs: {
        Row: {
          log_id: string;
          guild_id: string;
          action: string;
          status: string;
          message: string | null;
          payload: Json;
          requested_by: string | null;
          created_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['music_control_logs']['Row']> & {
          guild_id: string;
          action: string;
          status: string;
        };
        Update: Partial<Database['nyang']['Tables']['music_control_logs']['Row']>;
        Relationships: [];
      };
      music_state: {
        Row: {
          guild_id: string;
          current_track: Json | null;
          queue: Json | null;
          voice_channel_id: string | null;
          text_channel_id: string | null;
          autoplay_enabled: boolean;
          filter_preset: string;
          volume: number;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['music_state']['Row']> & { guild_id: string };
        Update: Partial<Database['nyang']['Tables']['music_state']['Row']>;
        Relationships: [];
      };
      reward_channels: {
        Row: {
          channel_id: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['reward_channels']['Row']> & { channel_id: string };
        Update: Partial<Database['nyang']['Tables']['reward_channels']['Row']>;
        Relationships: [];
      };
      users: {
        Row: {
          discord_user_id: string;
          username: string | null;
          avatar_url: string | null;
          created_at: string;
          last_seen_at: string | null;
        };
        Insert: Partial<Database['nyang']['Tables']['users']['Row']> & { discord_user_id: string };
        Update: Partial<Database['nyang']['Tables']['users']['Row']>;
        Relationships: [];
      };
      point_balances: {
        Row: {
          discord_user_id: string;
          balance: number;
          daily_chest_streak: number;
          daily_chest_last_claim_date: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['point_balances']['Row']> & { discord_user_id: string };
        Update: Partial<Database['nyang']['Tables']['point_balances']['Row']>;
        Relationships: [];
      };
      sword_forge_state: {
        Row: {
          discord_user_id: string;
          level: number;
          enhance_attempts: number;
          success_count: number;
          sold_count: number;
          last_enhanced_at: string | null;
          last_sold_at: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['sword_forge_state']['Row']> & { discord_user_id: string };
        Update: Partial<Database['nyang']['Tables']['sword_forge_state']['Row']>;
        Relationships: [];
      };
      point_events: {
        Row: {
          id: string;
          discord_user_id: string;
          kind: string;
          amount: number;
          idempotency_key: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['point_events']['Row']> & {
          discord_user_id: string;
          kind: string;
          amount: number;
        };
        Update: Partial<Database['nyang']['Tables']['point_events']['Row']>;
        Relationships: [];
      };
      items: {
        Row: {
          item_id: string;
          name: string;
          rarity: Database['nyang']['Enums']['gacha_rarity'];
          discord_role_id: string | null;
          is_active: boolean;
          is_equippable: boolean;
          duplicate_refund_points: number;
          reward_points: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['items']['Row']> & { name: string; rarity: string };
        Update: Partial<Database['nyang']['Tables']['items']['Row']>;
        Relationships: [];
      };
      gacha_pools: {
        Row: {
          pool_id: string;
          name: string;
          kind: Database['nyang']['Enums']['gacha_pool_kind'];
          is_active: boolean;
          banner_image_url: string | null;
          cost_points: number;
          paid_pull_cooldown_seconds: number;
          free_pull_interval_seconds: number | null;
          rate_r: number;
          rate_s: number;
          rate_ss: number;
          rate_sss: number;
          pity_threshold: number | null;
          pity_rarity: Database['nyang']['Enums']['gacha_rarity'] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['gacha_pools']['Row']> & { name: string };
        Update: Partial<Database['nyang']['Tables']['gacha_pools']['Row']>;
        Relationships: [];
      };
      gacha_pool_items: {
        Row: {
          pool_id: string;
          item_id: string;
          weight: number;
        };
        Insert: Database['nyang']['Tables']['gacha_pool_items']['Row'];
        Update: Partial<Database['nyang']['Tables']['gacha_pool_items']['Row']>;
        Relationships: [];
      };
      gacha_user_state: {
        Row: {
          discord_user_id: string;
          pool_id: string;
          pity_counter: number;
          free_available_at: string | null;
          paid_available_at: string | null;
          updated_at: string;
        };
        Insert: Database['nyang']['Tables']['gacha_user_state']['Row'];
        Update: Partial<Database['nyang']['Tables']['gacha_user_state']['Row']>;
        Relationships: [];
      };
      gacha_pulls: {
        Row: {
          pull_id: string;
          discord_user_id: string;
          pool_id: string;
          is_free: boolean;
          spent_points: number;
          created_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['gacha_pulls']['Row']> & { discord_user_id: string; pool_id: string };
        Update: Partial<Database['nyang']['Tables']['gacha_pulls']['Row']>;
        Relationships: [];
      };
      gacha_pull_results: {
        Row: {
          pull_id: string;
          item_id: string;
          qty: number;
          is_pity: boolean;
          is_variant: boolean;
        };
        Insert: Database['nyang']['Tables']['gacha_pull_results']['Row'];
        Update: Partial<Database['nyang']['Tables']['gacha_pull_results']['Row']>;
        Relationships: [];
      };
      inventory: {
        Row: {
          discord_user_id: string;
          item_id: string;
          qty: number;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['inventory']['Row']> & { discord_user_id: string; item_id: string };
        Update: Partial<Database['nyang']['Tables']['inventory']['Row']>;
        Relationships: [];
      };
      equipped: {
        Row: {
          discord_user_id: string;
          item_id: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['equipped']['Row']> & { discord_user_id: string };
        Update: Partial<Database['nyang']['Tables']['equipped']['Row']>;
        Relationships: [];
      };
      role_sync_jobs: {
        Row: {
          job_id: string;
          discord_user_id: string;
          add_role_id: string | null;
          remove_role_id: string | null;
          reason: string;
          status: Database['nyang']['Enums']['role_sync_job_status'];
          attempts: number;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['nyang']['Tables']['role_sync_jobs']['Row']> & { discord_user_id: string };
        Update: Partial<Database['nyang']['Tables']['role_sync_jobs']['Row']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          content: string;
          type: 'info' | 'warning' | 'success' | 'error';
          is_read: boolean;
          created_at: string;
          expires_at: string | null;
          metadata: Json | null;
          reward_points: number;
          reward_item_id: string | null;
          reward_item_qty: number;
          is_reward_claimed: boolean;
        };
        Insert: Partial<Database['nyang']['Tables']['notifications']['Row']> & { 
          user_id: string;
          title: string;
          content: string;
          type: 'info' | 'warning' | 'success' | 'error';
        };
        Update: Partial<Database['nyang']['Tables']['notifications']['Row']>;
        Relationships: [
          {
            foreignKeyName: "notifications_reward_item_id_fkey"
            columns: ["reward_item_id"]
            referencedRelation: "items"
            referencedColumns: ["item_id"]
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      claim_notification_reward: {
        Args: {
          p_notification_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      claim_daily_chest: {
        Args: {
          p_discord_user_id: string;
        };
        Returns: Array<{
          out_already_claimed: boolean;
          out_reward_points: number;
          out_reward_item_id: string | null;
          out_reward_item_name: string | null;
          out_reward_item_rarity: Database['nyang']['Enums']['gacha_rarity'] | null;
          out_reward_tier: string;
          out_new_balance: number;
          out_next_available_at: string;
        }>;
      };
      get_sword_forge_status: {
        Args: {
          p_discord_user_id: string;
        };
        Returns: Array<{
          out_level: number;
          out_enhance_cost: number;
          out_sell_price: number;
          out_success_rate_pct: number;
          out_balance: number;
          out_enhance_attempts: number;
          out_success_count: number;
          out_sold_count: number;
        }>;
      };
      enhance_sword: {
        Args: {
          p_discord_user_id: string;
        };
        Returns: Array<{
          out_success: boolean;
          out_error_code: string | null;
          out_previous_level: number;
          out_new_level: number;
          out_cost: number;
          out_result: string;
          out_success_rate_pct: number;
          out_sell_price: number;
          out_new_balance: number;
          out_enhance_attempts: number;
          out_success_count: number;
        }>;
      };
      sell_sword: {
        Args: {
          p_discord_user_id: string;
        };
        Returns: Array<{
          out_success: boolean;
          out_error_code: string | null;
          out_sold_level: number;
          out_payout: number;
          out_new_balance: number;
          out_reset_level: number;
          out_next_enhance_cost: number;
          out_sell_count: number;
        }>;
      };
      play_lottery_ticket: {
        Args: {
          p_discord_user_id: string;
        };
        Returns: Array<{
          out_success: boolean;
          out_error_code: string | null;
          out_ticket_price: number;
          out_ticket_number: number;
          out_tier: string;
          out_payout: number;
          out_net_change: number;
          out_new_balance: number;
          out_next_available_at: string | null;
        }>;
      };
      ensure_user: {
        Args: { p_discord_user_id: string };
        Returns: undefined;
      };
      admin_adjust_points: {
        Args: { p_discord_user_id: string; p_amount: number; p_reason?: string };
        Returns: number;
      };
      perform_gacha_draw: {
        Args: { p_discord_user_id: string; p_pool_id?: string | null };
        Returns: Array<{
          out_item_id: string;
          out_name: string;
          out_rarity: Database['nyang']['Enums']['gacha_rarity'];
          out_discord_role_id: string | null;
          out_is_free: boolean;
          out_refund_points: number;
          out_reward_points: number;
          out_new_balance: number;
          out_is_variant: boolean;
        }>;
      };
      set_equipped_item: {
        Args: { p_discord_user_id: string; p_item_id: string | null };
        Returns: Array<{
          previous_item_id: string | null;
          new_item_id: string | null;
          previous_role_id: string | null;
          new_role_id: string | null;
        }>;
      };
      grant_chat_points: {
        Args: {
          p_discord_user_id: string;
          p_channel_id: string;
          p_message_length: number;
          p_message_ts: string;
          p_message_id?: string | null;
          p_is_booster?: boolean;
        };
        Returns: Array<{ granted_points: number; new_balance: number }>;
      };
      grant_voice_points: {
        Args: {
          p_discord_user_id: string;
          p_channel_id: string;
          p_voice_ts: string;
          p_is_booster?: boolean;
        };
        Returns: Array<{ granted_points: number; new_balance: number }>;
      };
    };
    Enums: {
      role_sync_job_status: 'pending' | 'running' | 'succeeded' | 'failed';
      gacha_pool_kind: 'permanent' | 'limited';
      gacha_rarity: 'R' | 'S' | 'SS' | 'SSS';
    };
    CompositeTypes: Record<string, never>;
  };
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
