import type { Client, GuildMember, TextChannel } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { recordActivityEvent } from '../services/activityEvents.js';

function renderTemplate(template: string, member: GuildMember) {
  return template
    .replaceAll('{user}', `<@${member.user.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name);
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
    const template = cfg.join_message_template ?? null;
    if (!channelId || !template) return;

    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const text = renderTemplate(template, member);
    await (channel as TextChannel).send(text).catch(() => null);
  });
}
