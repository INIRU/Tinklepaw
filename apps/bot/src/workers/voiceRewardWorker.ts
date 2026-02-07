import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { recordActivityEvents } from '../services/activityEvents.js';

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
      const effectiveIntervalSeconds = Math.max(intervalSeconds, 15);
      nextDelayMs = effectiveIntervalSeconds * 1000;

      const shouldGrantPoints = Boolean(config && config.voice_reward_points_per_interval > 0);

      const guild = await client.guilds.fetch(ctx.env.NYARU_GUILD_ID).catch(() => null);
      if (!guild) return;

      const now = new Date().toISOString();
      const tasks: PromiseLike<void>[] = [];
      const events: Array<{
        guildId: string;
        userId: string | null;
        eventType: 'voice_seconds';
        value: number;
        meta: {
          channel_id: string;
          sampled_at: string;
          sampled_interval_seconds: number;
        };
      }> = [];

      guild.voiceStates.cache.forEach((state) => {
        if (!state.channelId) return;
        const member = state.member;
        if (!member || member.user.bot) return;
        const isBooster = Boolean(member.premiumSinceTimestamp);

        events.push({
          guildId: guild.id,
          userId: member.id,
          eventType: 'voice_seconds',
          value: effectiveIntervalSeconds,
          meta: {
            channel_id: state.channelId,
            sampled_at: now,
            sampled_interval_seconds: effectiveIntervalSeconds,
          }
        });

        if (!shouldGrantPoints) {
          return;
        }

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

      if (events.length > 0) {
        await recordActivityEvents(events);
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
