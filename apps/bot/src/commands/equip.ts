import { SlashCommandBuilder } from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

export const equipCommand: SlashCommand = {
  name: 'equip',
  json: new SlashCommandBuilder()
    .setName('equip')
    .setNameLocalizations({ ko: '장착' })
    .setDescription('아이템을 장착하여 역할을 받습니다.')
    .addStringOption((opt) => opt
      .setName('name')
      .setNameLocalizations({ ko: '이름' })
      .setDescription('아이템 이름')
      .setRequired(true))
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({ content: '이 명령어는 지정된 서버에서만 사용할 수 있습니다.', ephemeral: true });
      return;
    }

    const name = interaction.options.getString('name', true);
    const { data: item, error: itemErr } = await ctx.supabase
      .from('items')
      .select('item_id, name')
      .eq('name', name)
      .eq('is_active', true)
      .single();

    if (itemErr || !item) {
      await interaction.reply({ content: '아이템을 찾을 수 없습니다.', ephemeral: true });
      return;
    }

    const { data, error } = await ctx.supabase.rpc('set_equipped_item', {
      p_discord_user_id: interaction.user.id,
      p_item_id: item.item_id
    });

    if (error) {
      const msg = error.message === 'ITEM_NOT_OWNED' ? '보유하지 않은 아이템입니다.' : `장착 실패: ${error.message}`;
      await interaction.reply({ content: msg, ephemeral: true });
      return;
    }

    const row = Array.isArray(data) ? data[0] : null;
    await interaction.reply({
      content: row?.previous_role_id && row?.new_role_id && row.previous_role_id !== row.new_role_id
        ? `**${name}** 장착 완료. 역할을 업데이트합니다...`
        : `**${name}** 장착 완료.`
    });
  }
};
