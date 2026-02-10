import { PermissionFlagsBits, type VoiceChannel } from 'discord.js';

import { getBotContext } from '../context.js';

export type VoiceRoomTemplate = {
  roomName: string;
  userLimit: number;
  rtcRegion: string | null;
  isLocked: boolean;
};

const clampUserLimit = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(99, Math.floor(value)));
};

const normalizeRoomName = (value: string | null | undefined, fallbackName: string) => {
  const name = value?.trim() || fallbackName;
  return name.slice(0, 90);
};

const resolveLocked = (channel: VoiceChannel) => {
  const overwrite = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  return Boolean(overwrite?.deny.has(PermissionFlagsBits.Connect));
};

export async function getVoiceRoomTemplate(userId: string, fallbackName: string): Promise<VoiceRoomTemplate> {
  const ctx = getBotContext();
  const { data, error } = await ctx.supabase
    .from('voice_room_templates')
    .select('room_name, user_limit, rtc_region, is_locked')
    .eq('discord_user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    roomName: normalizeRoomName(data?.room_name, fallbackName),
    userLimit: clampUserLimit(data?.user_limit),
    rtcRegion: data?.rtc_region ?? null,
    isLocked: Boolean(data?.is_locked),
  };
}

export async function saveVoiceRoomTemplate(userId: string, template: VoiceRoomTemplate): Promise<void> {
  const ctx = getBotContext();

  const { error } = await ctx.supabase.from('voice_room_templates').upsert(
    {
      discord_user_id: userId,
      room_name: normalizeRoomName(template.roomName, '개인 통화방'),
      user_limit: clampUserLimit(template.userLimit),
      rtc_region: template.rtcRegion,
      is_locked: template.isLocked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'discord_user_id' },
  );

  if (error) {
    throw error;
  }
}

export async function saveVoiceRoomTemplateFromChannel(userId: string, channel: VoiceChannel): Promise<void> {
  await saveVoiceRoomTemplate(userId, {
    roomName: channel.name,
    userLimit: channel.userLimit,
    rtcRegion: channel.rtcRegion,
    isLocked: resolveLocked(channel),
  });
}

export async function rememberVoiceAutoRoom(channelId: string, ownerUserId: string, categoryId: string | null): Promise<void> {
  const ctx = getBotContext();

  const { error } = await ctx.supabase.from('voice_auto_rooms').upsert(
    {
      channel_id: channelId,
      owner_discord_user_id: ownerUserId,
      category_id: categoryId,
    },
    { onConflict: 'channel_id' },
  );

  if (error) {
    throw error;
  }
}

export async function getVoiceAutoRoom(channelId: string): Promise<{ ownerUserId: string; categoryId: string | null } | null> {
  const ctx = getBotContext();

  const { data, error } = await ctx.supabase
    .from('voice_auto_rooms')
    .select('owner_discord_user_id, category_id')
    .eq('channel_id', channelId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    ownerUserId: data.owner_discord_user_id,
    categoryId: data.category_id,
  };
}

export async function getLatestVoiceAutoRoomByOwner(ownerUserId: string): Promise<{ channelId: string; categoryId: string | null } | null> {
  const ctx = getBotContext();

  const { data, error } = await ctx.supabase
    .from('voice_auto_rooms')
    .select('channel_id, category_id')
    .eq('owner_discord_user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    channelId: data.channel_id,
    categoryId: data.category_id,
  };
}

export async function forgetVoiceAutoRoom(channelId: string): Promise<void> {
  const ctx = getBotContext();
  const { error } = await ctx.supabase.from('voice_auto_rooms').delete().eq('channel_id', channelId);
  if (error) {
    throw error;
  }
}

export async function setVoiceRoomLock(channel: VoiceChannel, ownerUserId: string, locked: boolean, reason: string): Promise<void> {
  await channel.permissionOverwrites.edit(channel.guild.roles.everyone, {
    Connect: locked ? false : null,
  }, { reason });

  await channel.permissionOverwrites.edit(ownerUserId, {
    Connect: true,
    ManageChannels: true,
    MoveMembers: true,
  }, { reason });
}
