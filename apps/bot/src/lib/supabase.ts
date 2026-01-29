import { createClient } from '@supabase/supabase-js';
import type { Database } from '@nyaru/core';

import type { Env } from './env.js';

export function createSupabaseAdminClient(env: Env) {
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
