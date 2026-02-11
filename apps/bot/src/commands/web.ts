import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';

const DEFAULT_WEB_URL = 'https://tinklepaw.vercel.app';

function normalizeWebUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export const webCommand: SlashCommand = {
  name: 'web',
  json: new SlashCommandBuilder()
    .setName('web')
    .setNameLocalizations({ ko: '웹' })
    .setDescription('방울냥 웹 UI 링크를 안내합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    const webUrl = normalizeWebUrl(ctx.env.NYARU_WEB_URL ?? DEFAULT_WEB_URL);
    const drawUrl = `${webUrl}/draw`;

    const embed = new EmbedBuilder()
      .setColor('#7DD3FC')
      .setTitle('🌐 방울냥 웹 안내')
      .setDescription('웹 UI 링크를 바로 열 수 있어요. 뽑기/인벤토리/강화를 더 편하게 사용할 수 있습니다.')
      .addFields(
        { name: '웹 홈', value: webUrl, inline: false },
        { name: '웹 뽑기', value: drawUrl, inline: false }
      );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel('웹 홈 열기').setStyle(ButtonStyle.Link).setURL(webUrl),
      new ButtonBuilder().setLabel('웹 뽑기 열기').setStyle(ButtonStyle.Link).setURL(drawUrl)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
