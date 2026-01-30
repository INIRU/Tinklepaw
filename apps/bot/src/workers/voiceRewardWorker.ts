import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';

export function startVoiceRewardWorker(client: Client) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    let nextDelayMs = 60_000;

    try {
      const ctx = getBotContext();
      const config = await getAppConfig().catch(() => null);
      const intervalSeconds = config?.voice_reward_interval_seconds ?? 60;
      nextDelayMs = Math.max(intervalSeconds, 15) * 1000;

      if (!config || config.voice_reward_points_per_interval <= 0) return;

      const guild = await client.guilds.fetch(ctx.env.NYARU_GUILD_ID).catch(() => null);
      if (!guild) return;

      const now = new Date().toISOString();
      const tasks: PromiseLike<void>[] = [];

      guild.voiceStates.cache.forEach((state) => {
        if (!state.channelId) return;
        const member = state.member;
        if (!member || member.user.bot) return;
        const isBooster = Boolean(member.premiumSinceTimestamp);

        tasks.push(
          ctx.supabase
            .rpc('grant_voice_points', {
              p_discord_user_id: member.id,
              p_channel_id: state.channelId,
              p_voice_ts: now,
              p_is_booster: isBooster
            })
            .then(({ error: rpcError }) => {
              if (rpcError) {
                console.error('[VoicePoints] Failed to grant points:', { userId: member.id, channelId: state.channelId, error: rpcError });
              }
            })
        );
      });

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    } catch (error) {
      console.error('[VoicePoints] Failed to process voice points:', error);
    } finally {
      isRunning = false;
      setTimeout(() => {
        void tick();
      }, nextDelayMs);
    }
  };

  void tick();
}
