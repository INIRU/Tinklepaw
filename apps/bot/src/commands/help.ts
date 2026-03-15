import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ChatInputCommandInteraction,
  type Message,
  type MessageComponentInteraction,
} from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { brandEmbed, Colors } from '../lib/embed.js';
import { getServerEmoji, getEmojiOption } from '../lib/serverEmoji.js';

type HelpCategory = 'game' | 'util' | 'info';

const CATEGORIES: Record<HelpCategory, { label: string; emoji: string; description: string }> = {
  game: { label: '게임', emoji: '🎮', description: '뽑기, 복권, 주식, 강화 등' },
  util: { label: '유틸리티', emoji: '🔧', description: '장착, 인벤토리, 알림 등' },
  info: { label: '정보', emoji: '📖', description: '웹사이트, 도움말, 마크 연동 등' },
};

const HELP_FIELDS: Record<HelpCategory, { name: string; value: string; inline?: boolean }[]> = {
  game: [
    { name: '/뽑기', value: '가챠를 돌려 역할 아이템을 뽑아봐!', inline: true },
    { name: '/일일상자', value: '하루 1번 보물상자를 열고 포인트 보상!', inline: true },
    { name: '/복권', value: '즉석 복권으로 당첨금을 노려봐!', inline: true },
    { name: '/주식', value: '주식 패널에서 매수/매도 진행!', inline: true },
    { name: '/강화', value: '참치캔을 강화하고 포인트로 판매!', inline: true },
  ],
  util: [
    { name: '/장착', value: '보유한 아이템을 선택해서 장착해!', inline: true },
    { name: '/해제', value: '장착 중인 아이템을 해제해.', inline: true },
    { name: '/가방', value: '보유한 아이템 목록을 확인해.', inline: true },
    { name: '/알림', value: '알림 설정을 관리해.', inline: true },
    { name: '/음성방', value: '임시 음성 채널을 생성해.', inline: true },
  ],
  info: [
    { name: '/웹', value: '웹 UI 링크를 안내해줘.', inline: true },
    { name: '/마인크래프트연동', value: '디코 ↔ 마크 계정을 연결해.', inline: true },
    { name: '대화하기', value: '봇을 멘션하거나 답장하면 대화 가능!', inline: false },
    { name: '미니게임', value: '"가위바위보" 또는 "끝말잇기"라고 말해봐!', inline: true },
  ],
};

export const helpCommand: SlashCommand = {
  name: 'help',
  json: new SlashCommandBuilder()
    .setName('help')
    .setNameLocalizations({ ko: '도움말' })
    .setDescription('사용 가능한 명령어 목록을 보여줍니다.')
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    const webUrl = (ctx.env.NYARU_WEB_URL || 'https://tinklepaw.vercel.app').replace(/\/+$/, '');
    const userId = interaction.user.id;
    let activeCategory: HelpCategory = 'game';

    const renderHelp = async (isEdit: boolean) => {
      const cat = CATEGORIES[activeCategory];
      const heart = getServerEmoji(interaction.client, 'heart', '🩷');
      const stars = getServerEmoji(interaction.client, 'stars', '✨');

      const embed = brandEmbed()
        .setColor(Colors.BRAND_PINK_2)
        .setAuthor({ name: '방울냥 도움말', iconURL: interaction.client.user.displayAvatarURL() })
        .setTitle(`${cat.emoji} ${cat.label} 명령어`)
        .setDescription(`${heart} 방울냥 봇의 명령어를 확인해보세요! ${stars}`)
        .addFields(HELP_FIELDS[activeCategory])
        .setFooter({ text: `방울냥 · 웹사이트: ${webUrl.replace(/^https?:\/\//, '')}` });

      const catOption = getEmojiOption(interaction.client, 'cat', '🎮');
      const hachOption = getEmojiOption(interaction.client, 'hach', '🔧');
      const chiiOption = getEmojiOption(interaction.client, 'chii', '📖');
      const categoryEmojis: Record<string, { id?: string; name: string; animated?: boolean }> = {
        game: catOption,
        util: hachOption,
        info: chiiOption,
      };

      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('help:category')
        .setPlaceholder('카테고리를 선택하세요')
        .addOptions(
          Object.entries(CATEGORIES).map(([key, c]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(c.label)
              .setDescription(c.description)
              .setValue(key)
              .setEmoji(categoryEmojis[key] ?? c.emoji)
              .setDefault(key === activeCategory),
          ),
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoryMenu);

      if (isEdit) {
        await interaction.editReply({ embeds: [embed], components: [row] });
      } else {
        await interaction.reply({ embeds: [embed], components: [row] });
      }
    };

    await renderHelp(false);

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) return;

    const collector = (reply as Message).createMessageComponentCollector({
      filter: (i: MessageComponentInteraction) => i.user.id === userId,
      time: 120_000,
    });

    collector.on('collect', async (menuInteraction: MessageComponentInteraction) => {
      if (menuInteraction.isStringSelectMenu() && menuInteraction.customId === 'help:category') {
        activeCategory = menuInteraction.values[0] as HelpCategory;
        await menuInteraction.deferUpdate();
        await renderHelp(true);
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
