import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getServerEnv } from './env';
import type { Database } from '@nyaru/core';

export function createSupabaseAdminClient() {
  const env = getServerEnv();
  return createClient<Database, 'nyang' | 'public'>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: {
      schema: env.SUPABASE_DB_SCHEMA
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}
