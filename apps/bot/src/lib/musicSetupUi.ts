import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

type MusicSetupField = { name: string; value: string; inline?: boolean };
type MusicSetupConfig = {
  music_setup_embed_title?: string | null;
  music_setup_embed_description?: string | null;
  music_setup_embed_fields?: MusicSetupField[] | null;
};

const baseColor = 0x3b82f6;

export const buildMusicSetupEmbed = (config: MusicSetupConfig | null, channelId: string) => {
  const defaultTitle = '🎶 음악 채널 설정 완료';
  const defaultDescription = `이 채널(<#${channelId}>)이 음악 명령어 채널로 설정되었습니다.`;
  const title = config?.music_setup_embed_title ?? defaultTitle;
  const descriptionTemplate = config?.music_setup_embed_description ?? defaultDescription;
  const description = descriptionTemplate.replaceAll('{channel}', `<#${channelId}>`);

  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(baseColor);
  const fields = config?.music_setup_embed_fields ?? [];
  if (fields.length) {
    embed.addFields(fields);
  }
  return embed;
};

export const buildMusicSetupRows = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music_search_open')
      .setLabel('음악 검색')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🔍'),
    new ButtonBuilder()
      .setLabel('대시보드')
      .setStyle(ButtonStyle.Link)
      .setURL('https://tinklepaw.vercel.app/music')
      .setEmoji('🧭')
  ),
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('music_prev')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏮️'),
    new ButtonBuilder()
      .setCustomId('music_play')
      .setStyle(ButtonStyle.Success)
      .setEmoji('▶️'),
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏸️'),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⏹️'),
    new ButtonBuilder()
      .setCustomId('music_next')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⏭️')
  )
];
