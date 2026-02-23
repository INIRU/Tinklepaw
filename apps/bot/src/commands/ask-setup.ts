import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getAppConfig } from '../services/config.js';

const askModeOptions = [
  {
    label: '익명 질문',
    value: 'anonymous',
    description: '질문자 이름을 숨기고 질문합니다.',
    emoji: '🎭',
  },
  {
    label: '질문',
    value: 'public',
    description: '질문자 정보와 함께 질문합니다.',
    emoji: '💬',
  },
];

export const askSetupCommand: SlashCommand = {
  name: '에스크셋팅',
  json: new SlashCommandBuilder()
    .setName('에스크셋팅')
    .setDescription('이 채널에 에스크 패널을 생성합니다.')
    .addChannelOption((option) =>
      option
        .setName('로그채널')
        .setDescription('질문 작성 로그를 남길 채널 (선택)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
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

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: '이 채널에서는 에스크 패널을 만들 수 없어요.', ephemeral: true });
      return;
    }

    const selectedLogChannel = interaction.options.getChannel('로그채널');
    const cfg = await getAppConfig().catch(() => null);
    const effectiveLogChannelId = selectedLogChannel?.id ?? cfg?.error_log_channel_id ?? null;

    const embed = new EmbedBuilder()
      .setColor(0xec4899)
      .setTitle('💌 에스크 박스')
      .setDescription(
        [
          '질문 모드를 선택한 뒤 **질문하기** 버튼을 눌러 주세요.',
          '답변은 생성된 쓰레드에서 진행됩니다.',
        ].join('\n')
      )
      .addFields(
        {
          name: '🧭 질문 모드',
          value: '드롭다운에서 **익명 질문 / 질문** 중 하나를 먼저 선택해 주세요.',
          inline: false,
        },
        {
          name: '🧾 로그 채널',
          value: effectiveLogChannelId ? `<#${effectiveLogChannelId}>` : '설정 없음 (기본 로그 채널 미사용)',
          inline: false,
        }
      )
      .setFooter({ text: '익명 질문도 내부 감사 로그에는 작성자 정보가 기록됩니다.' })
      .setTimestamp();

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ask:mode')
        .setPlaceholder('질문 모드를 선택하세요')
        .addOptions(askModeOptions)
    );

    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ask:open:${effectiveLogChannelId ?? 'none'}`)
        .setLabel('질문하기')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✍️')
    );

    await channel.send({ embeds: [embed], components: [selectRow, buttonRow] });
    await interaction.reply({ content: '에스크 패널을 생성했어요.', ephemeral: true });
  },
};
