import { SlashCommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

export const unequipCommand: SlashCommand = {
  name: 'unequip',
  json: new SlashCommandBuilder()
    .setName('unequip')
    .setNameLocalizations({ ko: '해제' })
    .setDescription('장착 중인 아이템을 해제합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({ content: '이 명령어는 지정된 서버에서만 사용할 수 있습니다.', ephemeral: true });
      return;
    }

    const { data, error } = await ctx.supabase.rpc('set_equipped_item', {
      p_discord_user_id: interaction.user.id,
      p_item_id: null
    });

    if (error) {
      await interaction.reply({ content: `해제 실패: ${error.message}`, ephemeral: true });
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.previous_item_id) {
      await interaction.reply({ content: '장착 중인 아이템이 없습니다.', ephemeral: true });
      return;
    }

    await interaction.reply({ content: '장착 해제 완료. 역할을 업데이트합니다...' });
  }
};
