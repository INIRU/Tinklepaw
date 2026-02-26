import { Rcon } from 'rcon-client';
import { getBotContext } from '../context.js';

interface RconConfig {
  host: string;
  port: number;
  password: string;
}

function getRconConfig(): RconConfig | null {
  const host = process.env.MINECRAFT_RCON_HOST;
  const password = process.env.MINECRAFT_RCON_PASSWORD;
  if (!host || !password) return null;
  return {
    host,
    port: Number(process.env.MINECRAFT_RCON_PORT ?? '25575'),
    password,
  };
}

/**
 * Fire-and-forget: invalidate Minecraft cache for a linked Discord user.
 * Looks up the minecraft_uuid, then sends RCON `nyaru-invalidate <uuid>`.
 * Never throws — all errors are silently ignored.
 */
export function invalidateLinkedPlayer(discordUserId: string): void {
  void _invalidate(discordUserId);
}

async function _invalidate(discordUserId: string): Promise<void> {
  try {
    const config = getRconConfig();
    if (!config) return;

    const ctx = getBotContext();
    const { data } = await ctx.supabase
      .schema('nyang')
      .from('minecraft_players')
      .select('minecraft_uuid')
      .eq('discord_user_id', discordUserId)
      .maybeSingle();

    if (!data?.minecraft_uuid) return;

    const rcon = new Rcon(config);
    await rcon.connect();
    await rcon.send(`nyaru-invalidate ${data.minecraft_uuid}`);
    await rcon.end();
  } catch {
    // Minecraft server may be offline — silently ignore
  }
}
