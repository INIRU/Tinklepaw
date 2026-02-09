import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

export const interfaceCommand: SlashCommand = {
  name: 'interface',
  json: new SlashCommandBuilder()
    .setName('interface')
    .setNameLocalizations({ ko: '인터페이스' })
    .setDescription('통화방 인터페이스를 엽니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();

    if (!interaction.guildId || !interaction.guild || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({
        content: '이 기능은 설정된 서버에서만 사용할 수 있어요.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎛️ VOICE INTERFACE')
      .setDescription([
        '## 통화방 인터페이스',
        '- 누구나 사용할 수 있어요. *(자기 통화방 기준)*',
        '- 버튼은 즉시 실행됩니다. *(현재 접속한 음성채널 기준)*',
        '',
        '**빠른 가이드**',
        '- 🔤 이름 변경  |  1️⃣/2️⃣/♾️ 인원 제한',
        '- 🔒 잠금  |  🔓 잠금해제  |  📨 초대링크',
        '- 🌐 리전 자동  |  🗑️ 채널 삭제',
      ].join('\n'))
      .setColor(0x38bdf8);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:rename_open')
        .setLabel('이름 변경')
        .setEmoji('🔤')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:1')
        .setLabel('1명 제한')
        .setEmoji('1️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:2')
        .setLabel('2명 제한')
        .setEmoji('2️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:lock')
        .setLabel('잠금')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:unlock')
        .setLabel('잠금해제')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:create:1')
        .setLabel('1인실')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:2')
        .setLabel('2인실')
        .setEmoji('🎧')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:0')
        .setLabel('다인실')
        .setEmoji('🗣️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('voice_if:invite')
        .setLabel('초대')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:region:auto')
        .setLabel('리전 자동')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:limit:0')
        .setLabel('인원 해제')
        .setEmoji('♾️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:delete')
        .setLabel('삭제')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({ content: '이 채널에는 인터페이스 메시지를 보낼 수 없어요.' });
      return;
    }

    await channel.send({
      embeds: [embed],
      components: [row1, row2, row3],
    });

    await interaction.deleteReply().catch(() => null);
  },
};
