import { createSupabaseAdminClient } from './supabase-admin';

export type PublicAppConfig = {
  serverIntro: string | null;
  bannerImageUrl: string | null;
  iconImageUrl: string | null;
  maintenanceModeEnabled: boolean;
  maintenanceModeReason: string | null;
  maintenanceModeUntil: string | null;
  maintenanceWebTargetPaths: string[];
  maintenanceBotTargetCommands: string[];
};

export async function fetchPublicAppConfig(): Promise<PublicAppConfig> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from('app_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    const row = (data ?? null) as {
      server_intro?: string | null;
      banner_image_url?: string | null;
      icon_image_url?: string | null;
      maintenance_mode_enabled?: boolean | null;
      maintenance_mode_reason?: string | null;
      maintenance_mode_until?: string | null;
      maintenance_web_target_paths?: string[] | null;
      maintenance_bot_target_commands?: string[] | null;
    } | null;

    return {
      serverIntro: row?.server_intro ?? null,
      bannerImageUrl: row?.banner_image_url ?? null,
      iconImageUrl: row?.icon_image_url ?? null,
      maintenanceModeEnabled: Boolean(row?.maintenance_mode_enabled ?? false),
      maintenanceModeReason: row?.maintenance_mode_reason ?? null,
      maintenanceModeUntil: row?.maintenance_mode_until ?? null,
      maintenanceWebTargetPaths: Array.isArray(row?.maintenance_web_target_paths)
        ? row.maintenance_web_target_paths.filter((v): v is string => typeof v === 'string')
        : [],
      maintenanceBotTargetCommands: Array.isArray(row?.maintenance_bot_target_commands)
        ? row.maintenance_bot_target_commands.filter((v): v is string => typeof v === 'string')
        : [],
    };
  } catch {
    return {
      serverIntro: null,
      bannerImageUrl: null,
      iconImageUrl: null,
      maintenanceModeEnabled: false,
      maintenanceModeReason: null,
      maintenanceModeUntil: null,
      maintenanceWebTargetPaths: [],
      maintenanceBotTargetCommands: [],
    };
  }
}
