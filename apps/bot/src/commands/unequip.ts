import { SlashCommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { successEmbed, errorEmbed, infoEmbed } from '../lib/embed.js';

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
      await interaction.reply({ embeds: [errorEmbed('서버 제한', '이 명령어는 지정된 서버에서만 사용할 수 있습니다.')], ephemeral: true });
      return;
    }

    const { data, error } = await ctx.supabase.rpc('set_equipped_item', {
      p_discord_user_id: interaction.user.id,
      p_item_id: null
    });

    if (error) {
      console.error('[Unequip] set_equipped_item failed:', error);
      await interaction.reply({ embeds: [errorEmbed('해제 실패', '해제 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.')], ephemeral: true });
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row?.previous_item_id) {
      await interaction.reply({ embeds: [infoEmbed('ℹ️ 장착 중인 아이템 없음', '현재 장착 중인 아이템이 없습니다.')], ephemeral: true });
      return;
    }

    await interaction.reply({ embeds: [successEmbed('장착 해제 완료', '🛡️ 아이템이 해제되었어요. 역할을 업데이트합니다...')] });
  }
};
