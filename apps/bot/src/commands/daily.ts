import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import { getBotContext } from '../context.js';
import { generateDailyChestGif } from '../lib/dailyChestGif.js';
import { brandEmbed, cooldownEmbed } from '../lib/embed.js';
import type { SlashCommand } from './types.js';

type DailyChestTier = 'common' | 'rare' | 'epic' | 'legendary';

type DailyChestClaimResult = {
  out_already_claimed: boolean;
  out_reward_points: number;
  out_reward_item_id: string | null;
  out_reward_item_name: string | null;
  out_reward_item_rarity: string | null;
  out_reward_tier: string;
  out_new_balance: number;
  out_next_available_at: string;
};

const TIER_LABELS: Record<DailyChestTier, string> = {
  common: '커먼',
  rare: '레어',
  epic: '에픽',
  legendary: '레전더리'
};

const TIER_COLORS: Record<DailyChestTier, number> = {
  common: 0x9ca3af,
  rare: 0x38bdf8,
  epic: 0xf97316,
  legendary: 0xfacc15
};

const toDailyChestTier = (value: string): DailyChestTier => {
  if (value === 'legendary' || value === 'epic' || value === 'rare') {
    return value;
  }
  return 'common';
};

const formatNextAvailable = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '내일';
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
};

const toDiscordRelativeTime = (value: string): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
};

export const dailyCommand: SlashCommand = {
  name: 'daily',
  json: new SlashCommandBuilder()
    .setName('daily')
    .setNameLocalizations({ ko: '일일상자' })
    .setDescription('일일 보물상자를 열고 보상을 획득합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();

    if (interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({
        content: '이 명령어는 설정된 서버에서만 사용할 수 있어요.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    try {
      const { data, error } = await ctx.supabase.rpc('claim_daily_chest', {
        p_discord_user_id: interaction.user.id
      });

      if (error) {
        console.error('[DailyChest] claim rpc failed:', error);
        await interaction.editReply({
          content: '일일 보물상자를 열지 못했어요. 잠시 후 다시 시도해줘.'
        });
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as DailyChestClaimResult | null;
      if (!row) {
        await interaction.editReply({ content: '보상 결과를 불러오지 못했어요. 잠시 후 다시 시도해줘.' });
        return;
      }

      if (row.out_already_claimed) {
        const nextAt = formatNextAvailable(row.out_next_available_at);
        const nextAtRelative = toDiscordRelativeTime(row.out_next_available_at);
        const nextLine = nextAtRelative
          ? `${nextAtRelative}`
          : `**${nextAt} (KST)**`;
        const alreadyEmbed = cooldownEmbed(
          '오늘의 보물상자는 이미 열었어!',
          `다음 오픈까지 조금만 기다려줘!`,
        )
          .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
          .addFields(
            { name: '⏰ 다음 오픈', value: nextLine, inline: true },
            { name: '💳 현재 포인트', value: `**${row.out_new_balance.toLocaleString('ko-KR')}P**`, inline: true },
          )
          .setFooter({ text: '방울냥 · 내일 다시 /daily 로 보물상자를 열어봐!' });

        await interaction.editReply({ embeds: [alreadyEmbed] });
        return;
      }

      const tier = toDailyChestTier(row.out_reward_tier);
      const attachment = await generateDailyChestGif({
        tier,
        points: row.out_reward_points
      });

      const nextAtRelative = toDiscordRelativeTime(row.out_next_available_at);

      const TIER_EMOJI: Record<DailyChestTier, string> = {
        common: '⬜',
        rare: '🟦',
        epic: '🟪',
        legendary: '🟨'
      };

      const rewardEmbed = brandEmbed()
        .setColor(TIER_COLORS[tier])
        .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`🎉 일일 보물상자 OPEN!`)
        .setDescription(`${TIER_EMOJI[tier]} 등급: **${TIER_LABELS[tier]}**`)
        .addFields(
          { name: '💰 획득 포인트', value: `**+${row.out_reward_points.toLocaleString('ko-KR')}P**`, inline: true },
          { name: '💳 현재 잔액', value: `**${row.out_new_balance.toLocaleString('ko-KR')}P**`, inline: true },
          { name: '⏰ 다음 상자', value: nextAtRelative ?? '내일', inline: true },
        )
        .setImage('attachment://treasure-open.gif')
        .setFooter({ text: '방울냥 · 내일 다시 /daily 로 보물상자를 열어봐!' });

      await interaction.editReply({
        embeds: [rewardEmbed],
        files: [attachment]
      });
    } catch (error) {
      console.error('[DailyChest] claim failed:', error);
      await interaction.editReply({
        content: '일일 보물상자를 처리하는 중 오류가 발생했어요. 잠시 후 다시 시도해줘.'
      });
    }
  }
};
