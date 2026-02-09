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
      .setTitle('🎛️ VOICE INTERFACE')
      .setDescription('관리자 전용 통화방 패널입니다. 버튼으로 통화방 생성/설정을 즉시 수행합니다.\n설정 버튼은 **현재 접속 중인 음성채널** 기준으로 동작합니다.')
      .addFields(
        { name: 'CREATE', value: 'SOLO / DUO / PARTY', inline: true },
        { name: 'CONTROL', value: 'NAME / LIMIT / PRIVACY / INVITE / REGION', inline: true },
      )
      .setColor(0x38bdf8);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:rename_open')
        .setLabel('NAME')
        .setEmoji('🔤')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:1')
        .setLabel('LIMIT 1')
        .setEmoji('1️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:limit:2')
        .setLabel('LIMIT 2')
        .setEmoji('2️⃣')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:lock')
        .setLabel('PRIVACY')
        .setEmoji('🔒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:unlock')
        .setLabel('UNLOCK')
        .setEmoji('🔓')
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:create:1')
        .setLabel('SOLO')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:2')
        .setLabel('DUO')
        .setEmoji('🎧')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('voice_if:create:0')
        .setLabel('PARTY')
        .setEmoji('🗣️')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('voice_if:invite')
        .setLabel('INVITE')
        .setEmoji('📨')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:region:auto')
        .setLabel('REGION')
        .setEmoji('🌐')
        .setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('voice_if:limit:0')
        .setLabel('UNLIMIT')
        .setEmoji('♾️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('voice_if:delete')
        .setLabel('DELETE')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2, row3],
    });
  },
};
