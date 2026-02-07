import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { recordActivityEvent } from '../services/activityEvents.js';

export function registerGuildMemberRemove(client: Client) {
  client.on('guildMemberRemove', (member) => {
    const ctx = getBotContext();
    if (member.guild.id !== ctx.env.NYARU_GUILD_ID) return;

    const userId = ('user' in member && member.user ? member.user.id : member.id) ?? null;
    if (!userId) return;

    void recordActivityEvent({
      guildId: member.guild.id,
      userId,
      eventType: 'member_leave',
      value: 1,
      meta: {
        source: 'guild_member_remove'
      }
    });
  });
}
