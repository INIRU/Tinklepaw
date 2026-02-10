import { ChannelType, type Client, type Guild, type VoiceChannel } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import {
  forgetVoiceAutoRoom,
  getVoiceAutoRoom,
  getLatestVoiceAutoRoomByOwner,
  getVoiceRoomTemplate,
  rememberVoiceAutoRoom,
  saveVoiceRoomTemplateFromChannel,
  setVoiceRoomLock,
} from '../services/voice-interface.js';

const activeAutoCreateUsers = new Set<string>();
const AUTO_ROOM_IDLE_TIMEOUT_MS = 120_000;
const AUTO_ROOM_JANITOR_INTERVAL_MS = 60_000;

async function cleanupTrackedVoiceChannel(guild: Guild, channelId: string, ownerUserId: string, reason: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    await forgetVoiceAutoRoom(channelId).catch(() => null);
    return;
  }

  if (channel.type !== ChannelType.GuildVoice) {
    await forgetVoiceAutoRoom(channelId).catch(() => null);
    return;
  }

  const nonBotMembers = channel.members.filter((m) => !m.user.bot);
  if (nonBotMembers.size > 0) {
    return;
  }

  await saveVoiceRoomTemplateFromChannel(ownerUserId, channel).catch(() => null);
  const deleted = await channel.delete(reason).then(() => true).catch(() => false);
  if (deleted) {
    await forgetVoiceAutoRoom(channelId).catch(() => null);
  }
}

async function runVoiceAutoRoomJanitor(client: Client) {
  const ctx = getBotContext();
  const guild = client.guilds.cache.get(ctx.env.NYARU_GUILD_ID) ?? await client.guilds.fetch(ctx.env.NYARU_GUILD_ID).catch(() => null);
  if (!guild) return;

  const cutoffIso = new Date(Date.now() - AUTO_ROOM_IDLE_TIMEOUT_MS).toISOString();
  const { data, error } = await ctx.supabase
    .from('voice_auto_rooms')
    .select('channel_id, owner_discord_user_id')
    .lte('created_at', cutoffIso)
    .limit(200);

  if (error) {
    console.warn('[voiceStateUpdate] janitor query failed:', error);
    return;
  }

  for (const row of data ?? []) {
    await cleanupTrackedVoiceChannel(guild, row.channel_id, row.owner_discord_user_id, 'voice auto room idle janitor cleanup');
  }
}

export function registerVoiceStateUpdate(client: Client) {
  client.once('ready', () => {
    void runVoiceAutoRoomJanitor(client);
    const timer = setInterval(() => {
      void runVoiceAutoRoomJanitor(client);
    }, AUTO_ROOM_JANITOR_INTERVAL_MS);
    timer.unref?.();
  });

  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      const ctx = getBotContext();
      const guild = newState.guild ?? oldState.guild;
      if (!guild || guild.id !== ctx.env.NYARU_GUILD_ID) return;

      const member = newState.member ?? oldState.member;
      const userId = member?.id;
      if (!userId || member?.user.bot) return;

      const leftChannel = oldState.channel;
      if (leftChannel && leftChannel.type === ChannelType.GuildVoice) {
        const tracked = await getVoiceAutoRoom(leftChannel.id);
        if (tracked) {
          const nonBotMembers = leftChannel.members.filter((m) => !m.user.bot);
          if (nonBotMembers.size === 0) {
            await cleanupTrackedVoiceChannel(guild, leftChannel.id, tracked.ownerUserId, 'auto voice room empty cleanup');
          }
        }
      }

      const cfg = await getAppConfig();
      const triggerChannelId = cfg.voice_interface_trigger_channel_id;
      if (!triggerChannelId) return;

      if (newState.channelId !== triggerChannelId) return;
      if (oldState.channelId === triggerChannelId) return;
      if (activeAutoCreateUsers.has(userId)) return;

      activeAutoCreateUsers.add(userId);

      try {
        const triggerChannel = newState.channel;
        if (!triggerChannel || triggerChannel.type !== ChannelType.GuildVoice) return;

        const existing = await getLatestVoiceAutoRoomByOwner(userId).catch(() => null);
        if (existing) {
          const existingChannel = await guild.channels.fetch(existing.channelId).catch(() => null);
          if (existingChannel && existingChannel.type === ChannelType.GuildVoice) {
            await member.voice.setChannel(existingChannel).catch(() => null);
            return;
          }
          await forgetVoiceAutoRoom(existing.channelId).catch(() => null);
        }

        const displayName = member.displayName || member.user.username;
        const template = await getVoiceRoomTemplate(userId, `${displayName}의 통화방`);
        const targetCategoryId = cfg.voice_interface_category_id ?? triggerChannel.parentId ?? null;

        const created = await guild.channels.create({
          name: template.roomName,
          type: ChannelType.GuildVoice,
          parent: targetCategoryId ?? undefined,
          userLimit: template.userLimit,
          rtcRegion: template.rtcRegion ?? undefined,
          reason: `voice auto room create for ${member.user.tag}`,
        });

        if (created.type !== ChannelType.GuildVoice) {
          await created.delete('invalid auto voice room type').catch(() => null);
          return;
        }

        if (template.isLocked) {
          await setVoiceRoomLock(created, userId, true, `voice auto room lock restore for ${member.user.tag}`);
        } else {
          await created.permissionOverwrites.edit(userId, {
            Connect: true,
            ManageChannels: true,
            MoveMembers: true,
          });
        }

        await rememberVoiceAutoRoom(created.id, userId, created.parentId ?? null);

        if (member.voice.channelId === triggerChannelId) {
          await member.voice.setChannel(created).catch(() => null);
        }
      } finally {
        activeAutoCreateUsers.delete(userId);
      }
    } catch (error) {
      console.warn('[voiceStateUpdate] failed to process voice auto room flow:', error);
    }
  });
}
