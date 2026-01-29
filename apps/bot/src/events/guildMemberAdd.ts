import type { Client, GuildMember, TextChannel } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';

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

    let cfg;
    try {
      cfg = await getAppConfig();
    } catch {
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
