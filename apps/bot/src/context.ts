import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@nyaru/core';

import type { Env } from './lib/env.js';

export type BotContext = {
  env: Env;
  supabase: SupabaseClient<Database, 'nyang' | 'public'>;
};

let ctx: BotContext | null = null;

export function setBotContext(next: BotContext) {
  ctx = next;
}

export function getBotContext(): BotContext {
  if (!ctx) throw new Error('Bot context not initialized');
  return ctx;
}
