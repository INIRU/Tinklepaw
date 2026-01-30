import { ChannelType, type Client, type GuildBasedChannel } from 'discord.js';

type CachedChannel = {
  id: string;
  name: string;
  position: number;
  parentId: string | null;
  type: ChannelType;
};

const channelsByGuild = new Map<string, CachedChannel[]>();

const toCachedChannel = (channel: GuildBasedChannel): CachedChannel | null => {
  if (channel.type !== ChannelType.GuildText) return null;
  if (!('position' in channel)) return null;

  return {
    id: channel.id,
    name: channel.name,
    position: channel.position,
    parentId: channel.parentId ?? null,
    type: channel.type
  };
};

export async function primeChannelCache(client: Client, guildId: string) {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return;

  const cached: CachedChannel[] = [];
  channels.forEach((channel) => {
    if (!channel) return;
    const mapped = toCachedChannel(channel);
    if (mapped) cached.push(mapped);
  });

  cached.sort((a, b) => a.position - b.position);
  channelsByGuild.set(guildId, cached);
}

export function getChannelMentions(guildId: string, limit = 5): string[] {
  const channels = channelsByGuild.get(guildId) ?? [];
  return channels.slice(0, limit).map((channel) => `<#${channel.id}>`);
}
