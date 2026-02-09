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
import { generateVoiceInterfaceLegendImage } from '../lib/voiceInterfaceImage.js';

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
      .setTitle('🎛️ VOICE INTERFACE')
      .setDescription('관리자 전용 통화방 패널입니다. 버튼은 이모지 전용이며, 아래 이미지에서 기능명을 확인해 주세요.')
      .setImage('attachment://voice-interface-guide.png')
      .setColor(0x38bdf8);

    const guideImage = await generateVoiceInterfaceLegendImage();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:rename_open')
        .setEmoji('🔤')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:1')
        .setEmoji('1️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:2')
        .setEmoji('2️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:lock')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:unlock')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:create:1')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:2')
        .setEmoji('🎧')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:0')
        .setEmoji('🗣️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('voice_if:invite')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:region:auto')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:limit:0')
        .setEmoji('♾️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:delete')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
      files: [guideImage],
    });
  },
};
