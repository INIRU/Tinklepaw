import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

export const interfaceCommand: SlashCommand = {
  name: 'interface',
  json: new SlashCommandBuilder()
    .setName('interface')
    .setNameLocalizations({ ko: '인터페이스' })
    .setDescription('관리자용 통화방 인터페이스를 엽니다.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
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

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: '관리자(채널 관리 권한)만 사용할 수 있어요.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎛️ 통화방 관리자 인터페이스')
      .setDescription('버튼으로 통화방 생성/설정을 빠르게 처리할 수 있어요.\n설정 버튼은 **현재 접속 중인 음성채널** 기준으로 동작합니다.')
      .addFields(
        { name: '통화방 생성', value: '1인실 / 2인실 / 다인실', inline: false },
        { name: '통화방 설정', value: '인원 제한 변경 / 이름 변경 / 잠금 / 잠금해제 / 삭제', inline: false },
      )
      .setColor(0x38bdf8);

    const createRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
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
        .setStyle(ButtonStyle.Success)
    );

    const limitRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('voice_if:limit:1').setLabel('1명 제한').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_if:limit:2').setLabel('2명 제한').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_if:limit:0').setLabel('인원 제한 해제').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_if:rename_open').setLabel('이름 변경').setEmoji('✏️').setStyle(ButtonStyle.Primary)
    );

    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('voice_if:lock').setLabel('통화방 잠금').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_if:unlock').setLabel('통화방 잠금해제').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_if:delete').setLabel('통화방 삭제').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    );

    await interaction.reply({
      embeds: [embed],
      components: [createRow, limitRow, controlRow],
      ephemeral: true,
    });
  },
};
