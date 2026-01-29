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
    })
    .select('*')
    .single();

  if (insErr) throw insErr;
  return created;
}
