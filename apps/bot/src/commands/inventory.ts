import { SlashCommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { generateInventoryEmbed } from '../services/inventory.js';

export const inventoryCommand: SlashCommand = {
  name: 'inventory',
  json: new SlashCommandBuilder()
    .setName('inventory')
    .setNameLocalizations({ ko: '가방' })
    .setDescription('보유한 아이템 목록을 확인합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('[Inventory] Failed to defer reply:', error);
      return;
    }

    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.editReply({ content: '이 명령어는 지정된 서버에서만 사용할 수 있습니다.' });
      return;
    }

    try {
      const embed = await generateInventoryEmbed(ctx, interaction.user);
      await interaction.editReply({ embeds: [embed] });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const message = e instanceof Error ? e.message : '오류가 발생했습니다.';
      await interaction.editReply({ content: message });
    }
  }
};
