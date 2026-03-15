import type { Client, GuildMember, TextChannel } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { recordActivityEvent } from '../services/activityEvents.js';
import { welcomeEmbed } from '../lib/embed.js';
import { getServerEmoji } from '../lib/serverEmoji.js';

/** Find a channel whose name contains the given keyword */
function findChannelByKeyword(member: GuildMember, keyword: string): string | undefined {
  const ch = member.guild.channels.cache.find(
    c => c.isTextBased() && c.name.includes(keyword)
  );
  return ch?.id;
}

export function registerGuildMemberAdd(client: Client) {
  client.on('guildMemberAdd', async (member: GuildMember) => {
    const ctx = getBotContext();
    if (member.guild.id !== ctx.env.NYARU_GUILD_ID) return;

    void recordActivityEvent({
      guildId: member.guild.id,
      userId: member.user.id,
      eventType: 'member_join',
      value: 1,
      meta: {
        source: 'guild_member_add'
      }
    });

    let cfg;
    try {
      cfg = await getAppConfig();
    } catch (error) {
      console.error('[GuildMemberAdd] Failed to load app config:', error);
      return;
    }

    const channelId = cfg.join_message_channel_id ?? null;
    if (!channelId) return;

    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const rulesChannelId = findChannelByKeyword(member, '규칙');
    const roleChannelId = findChannelByKeyword(member, '역할');

    const botUser = client.user;

    const embed = welcomeEmbed({
      memberMention: `<@${member.user.id}>`,
      memberName: member.user.displayName,
      memberAvatarURL: member.user.displayAvatarURL({ size: 256 }),
      serverName: member.guild.name,
      memberCount: member.guild.memberCount,
      rulesChannelId,
      roleChannelId,
      botAvatarURL: botUser?.displayAvatarURL() ?? null,
      emojis: {
        heart: getServerEmoji(client, 'heart', '🩷'),
        catPaw: getServerEmoji(client, 'catPaw', '🐾'),
        stars: getServerEmoji(client, 'stars', '✨'),
      },
    });

    await (channel as TextChannel).send({ embeds: [embed] }).catch(() => null);
  });
}
