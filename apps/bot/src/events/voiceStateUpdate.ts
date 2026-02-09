import { ChannelType, type Client, type VoiceChannel } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import {
  forgetVoiceAutoRoom,
  getVoiceAutoRoom,
  getVoiceRoomTemplate,
  rememberVoiceAutoRoom,
  saveVoiceRoomTemplateFromChannel,
  setVoiceRoomLock,
} from '../services/voice-interface.js';

const activeAutoCreateUsers = new Set<string>();

export function registerVoiceStateUpdate(client: Client) {
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
            await saveVoiceRoomTemplateFromChannel(tracked.ownerUserId, leftChannel as VoiceChannel);
            await forgetVoiceAutoRoom(leftChannel.id);
            await leftChannel.delete('auto voice room empty cleanup').catch(() => null);
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
