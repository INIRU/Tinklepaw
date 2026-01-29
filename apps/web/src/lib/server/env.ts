import 'server-only';

import { z } from 'zod';

const ServerEnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  NYARU_GUILD_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_SCHEMA: z.enum(['nyang', 'public']).default('nyang')
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function getServerEnv(): ServerEnv {
  const parsed = ServerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid web server environment:\n${issues}`);
  }

  return parsed.data;
}
