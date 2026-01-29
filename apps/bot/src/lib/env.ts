import { z } from 'zod';

const EnvSchema = z.object({
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_BOT_TOKEN: z.string().min(1),
  NYARU_GUILD_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_SCHEMA: z.enum(['nyang', 'public']).default('nyang'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  LAVALINK_HOST: z.string().default('localhost'),
  LAVALINK_PORT: z.string().transform(Number).default('2333'),
  LAVALINK_AUTH: z.string().optional(),
  LAVALINK_SERVER_PASSWORD: z.string().optional(),
  LAVALINK_SECURE: z.string().transform((v) => v === 'true').default('false')
});

export type Env = z.infer<typeof EnvSchema>;

export function assertEnv(env: NodeJS.ProcessEnv): Env {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const auth = parsed.data.LAVALINK_AUTH || parsed.data.LAVALINK_SERVER_PASSWORD || 'youshallnotpass';
  return { ...parsed.data, LAVALINK_AUTH: auth };
}
