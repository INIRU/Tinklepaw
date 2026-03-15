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

type LeaderboardCategory = 'points' | 'stock' | 'gacha' | 'daily';

const CATEGORIES: Record<LeaderboardCategory, { label: string; emoji: string; description: string; color: number }> = {
  points: { label: '포인트 랭킹', emoji: '💰', description: '보유 포인트 순위', color: Colors.BRAND_LEMON },
  stock: { label: '주식 수익률', emoji: '📈', description: '주식 투자 수익 순위', color: Colors.BRAND_MINT },
  gacha: { label: '뽑기 행운아', emoji: '🎰', description: 'SSS/SS 등급 획득 순위', color: Colors.BRAND_PINK },
  daily: { label: '출석왕', emoji: '📅', description: '일일 보물상자 오픈 횟수 순위', color: Colors.BRAND_SKY },
};

const MEDAL = ['🥇', '🥈', '🥉'];
const PANEL_TIMEOUT_MS = 3 * 60 * 1000;

async function fetchRanking(category: LeaderboardCategory): Promise<{ userId: string; value: number; label: string }[]> {
  const ctx = getBotContext();

  if (category === 'points') {
    const { data } = await ctx.supabase
      .from('point_balances')
      .select('discord_user_id, balance')
      .order('balance', { ascending: false })
      .limit(10);
    return (data ?? []).map(r => ({
      userId: r.discord_user_id,
      value: r.balance,
      label: `${r.balance.toLocaleString('ko-KR')}P`,
    }));
  }

  if (category === 'stock') {
    const { data } = await (ctx.supabase
      .from('stock_holdings')
      .select('discord_user_id, unrealized_pnl')
      .order('unrealized_pnl', { ascending: false })
      .limit(10) as unknown as Promise<{ data: { discord_user_id: string; unrealized_pnl: number }[] | null }>);
    return (data ?? []).map(r => ({
      userId: r.discord_user_id,
      value: r.unrealized_pnl,
      label: `${r.unrealized_pnl >= 0 ? '+' : ''}${r.unrealized_pnl.toLocaleString('ko-KR')}P`,
    }));
  }

  if (category === 'gacha') {
    // Count SSS + SS items per user from gacha_draw_log
    const { data } = await (ctx.supabase.rpc as Function)('leaderboard_gacha_lucky');
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((r: { discord_user_id: string; lucky_count: number }) => ({
      userId: r.discord_user_id,
      value: r.lucky_count,
      label: `${r.lucky_count}회`,
    }));
  }

  if (category === 'daily') {
    const { data } = await (ctx.supabase.rpc as Function)('leaderboard_daily_streak');
    if (!Array.isArray(data)) return [];
    return data.slice(0, 10).map((r: { discord_user_id: string; claim_count: number }) => ({
      userId: r.discord_user_id,
      value: r.claim_count,
      label: `${r.claim_count}회`,
    }));
  }

  return [];
}

function buildLeaderboardEmbed(
  category: LeaderboardCategory,
  rankings: { userId: string; value: number; label: string }[],
  userRank?: { rank: number; value: number; label: string } | null,
) {
  const cat = CATEGORIES[category];

  const embed = brandEmbed()
    .setColor(cat.color)
    .setAuthor({ name: '방울냥 리더보드' })
    .setTitle(`${cat.emoji} ${cat.label}`);

  if (rankings.length === 0) {
    embed.setDescription('아직 데이터가 없어요!');
    return embed;
  }

  const lines = rankings.map((entry, i) => {
    const medal = i < 3 ? MEDAL[i] : `\`${(i + 1).toString().padStart(2, ' ')}\``;
    return `${medal}  <@${entry.userId}>  —  **${entry.label}**`;
  });

  embed.setDescription(lines.join('\n'));

  if (userRank && userRank.rank > 10) {
    embed.addFields({
      name: '📍 내 순위',
      value: `**${userRank.rank}위** — ${userRank.label}`,
      inline: false,
    });
  }

  embed.setFooter({ text: `방울냥 · 리더보드 · 상위 ${rankings.length}명` });
  return embed;
}

export const leaderboardCommand: SlashCommand = {
  name: 'leaderboard',
  json: new SlashCommandBuilder()
    .setName('leaderboard')
    .setNameLocalizations({ ko: '순위' })
    .setDescription('서버 리더보드를 확인합니다.')
    .toJSON(),

  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();

    if (interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({ content: '이 명령어는 설정된 서버에서만 사용할 수 있어요.', ephemeral: true });
      return;
    }

    await interaction.deferReply();

    const userId = interaction.user.id;
    let activeCategory: LeaderboardCategory = 'points';

    const renderPanel = async () => {
      const rankings = await fetchRanking(activeCategory);

      const embed = buildLeaderboardEmbed(activeCategory, rankings);

      const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('lb:category')
        .setPlaceholder('랭킹 카테고리')
        .addOptions(
          Object.entries(CATEGORIES).map(([key, cat]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(cat.label)
              .setDescription(cat.description)
              .setValue(key)
              .setEmoji(cat.emoji)
              .setDefault(key === activeCategory),
          ),
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(categoryMenu);

      await interaction.editReply({ embeds: [embed], components: [row] });
    };

    await renderPanel();

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) return;

    const collector = (reply as Message).createMessageComponentCollector({
      filter: (i: MessageComponentInteraction) => i.user.id === userId,
      time: PANEL_TIMEOUT_MS,
    });

    collector.on('collect', async (menuInteraction: MessageComponentInteraction) => {
      if (menuInteraction.isStringSelectMenu() && menuInteraction.customId === 'lb:category') {
        activeCategory = menuInteraction.values[0] as LeaderboardCategory;
        await menuInteraction.deferUpdate();
        await renderPanel();
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
