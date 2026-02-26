import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';

export function registerGuildBanAdd(client: Client) {
  client.on('guildBanAdd', async (ban) => {
    const ctx = getBotContext();
    if (ban.guild.id !== ctx.env.NYARU_GUILD_ID) return;

    const userId = ban.user.id;
    const { supabase } = ctx;
    try {
      const { data: mcPlayer } = await supabase
        .schema('nyang')
        .from('minecraft_players')
        .select('minecraft_uuid')
        .eq('discord_user_id', userId)
        .maybeSingle();

      if (mcPlayer) {
        const uuid = mcPlayer.minecraft_uuid;
        await Promise.all([
          supabase.schema('nyang').from('mc_market_trades').delete().eq('minecraft_uuid', uuid),
          supabase.schema('nyang').from('mc_daily_quests').delete().eq('minecraft_uuid', uuid),
          supabase.schema('nyang').from('mc_p2p_listings').delete().eq('seller_uuid', uuid),
        ]);
        await supabase.schema('nyang').from('minecraft_players').delete().eq('discord_user_id', userId);
        console.log(`[Minecraft] Unlinked ${userId} (${uuid}) due to ban`);
      }
    } catch (err) {
      console.error('[Minecraft] Failed to unlink on ban:', err);
    }
  });
}
