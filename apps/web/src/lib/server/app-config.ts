import { createSupabaseAdminClient } from './supabase-admin';

export type PublicAppConfig = {
  serverIntro: string | null;
  bannerImageUrl: string | null;
  iconImageUrl: string | null;
};

export async function fetchPublicAppConfig(): Promise<PublicAppConfig> {
  const supabase = createSupabaseAdminClient();
  try {
    const { data } = await supabase
      .from('app_config')
      .select('server_intro,banner_image_url,icon_image_url')
      .eq('id', 1)
      .maybeSingle();

    return {
      serverIntro: (data?.server_intro as string | null | undefined) ?? null,
      bannerImageUrl: (data?.banner_image_url as string | null | undefined) ?? null,
      iconImageUrl: (data?.icon_image_url as string | null | undefined) ?? null,
    };
  } catch {
    return {
      serverIntro: null,
      bannerImageUrl: null,
      iconImageUrl: null,
    };
  }
}
