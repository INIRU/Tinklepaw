import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { buildMusicSetupEmbed, buildMusicSetupRows } from '../lib/musicSetupUi.js';
import { getAppConfig, invalidateAppConfigCache } from '../services/config.js';

export const setupCommand: SlashCommand = {
  name: 'setup',
  json: new SlashCommandBuilder()
    .setName('setup')
    .setNameLocalizations({ ko: '셋업' })
    .setDescription('음악 명령어 채널을 설정하고 안내 UI를 표시합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: '서버에서만 사용할 수 있어요.', ephemeral: true });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '서버 관리자만 사용할 수 있어요.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const ctx = getBotContext();
    const channelId = interaction.channelId;
    const { error } = await ctx.supabase
      .from('app_config')
      .upsert({
        id: 1,
        guild_id: ctx.env.NYARU_GUILD_ID ?? interaction.guildId,
        music_command_channel_id: channelId
      });

    if (error) {
      await interaction.editReply({ content: '설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }

    invalidateAppConfigCache();

    const config = await getAppConfig().catch(() => null);
    const embed = buildMusicSetupEmbed(config, channelId);
    const rows = buildMusicSetupRows();

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({ content: '이 채널에서 메시지를 보낼 수 없습니다.' });
      return;
    }

    const sent = await channel.send({ embeds: [embed], components: rows });
    await ctx.supabase
      .from('app_config')
      .update({ music_setup_message_id: sent.id })
      .eq('id', 1);
    await interaction.deleteReply().catch(() => null);
  }
};
