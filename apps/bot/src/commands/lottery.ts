import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';

import { getBotContext } from '../context.js';
import { generateLotteryTicketImage } from '../lib/lotteryTicketImage.js';
import type { LotteryTier } from '../lib/lotteryTicketImage.js';
import { brandEmbed, cooldownEmbed, errorEmbed } from '../lib/embed.js';
import type { SlashCommand } from './types.js';

type LotteryResultRow = {
  out_success: boolean;
  out_error_code: string | null;
  out_ticket_price: number;
  out_ticket_number: number;
  out_tier: string;
  out_payout: number;
  out_net_change: number;
  out_new_balance: number;
  out_next_available_at: string | null;
};

const TIER_LABELS: Record<LotteryTier, string> = {
  jackpot: '잭팟',
  gold: '골드',
  silver: '실버',
  bronze: '브론즈',
  miss: '꽝'
};

const TIER_COLORS: Record<LotteryTier, number> = {
  jackpot: 0xf59e0b,
  gold: 0xfbbf24,
  silver: 0x60a5fa,
  bronze: 0xfb7185,
  miss: 0x64748b
};

const TIER_TITLES: Record<LotteryTier, string> = {
  jackpot: '💎 JACKPOT! 대박 당첨!',
  gold: '🏆 GOLD 당첨!',
  silver: '✨ SILVER 당첨!',
  bronze: '🎉 BRONZE 당첨!',
  miss: '🎫 아쉽지만 다음 기회에!'
};

const toLotteryTier = (value: string): LotteryTier => {
  if (value === 'jackpot' || value === 'gold' || value === 'silver' || value === 'bronze') {
    return value;
  }
  return 'miss';
};

const signedP = (value: number) => `${value >= 0 ? '+' : ''}${value.toLocaleString('ko-KR')} p`;

const toRelativeTime = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
};

export const lotteryCommand: SlashCommand = {
  name: 'lottery',
  json: new SlashCommandBuilder()
    .setName('lottery')
    .setNameLocalizations({ ko: '복권' })
    .setDescription('즉석 복권을 구매해서 당첨금을 노려봐!')
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
      const { data, error } = await ctx.supabase.rpc('play_lottery_ticket', {
        p_discord_user_id: interaction.user.id
      });

      if (error) {
        console.error('[Lottery] play rpc failed:', error);
        await interaction.editReply({
          content: '복권 처리 중 오류가 발생했어. 잠시 후 다시 시도해줘.'
        });
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as LotteryResultRow | null;
      if (!row) {
        await interaction.editReply({ content: '복권 결과를 불러오지 못했어. 잠시 후 다시 시도해줘.' });
        return;
      }

      if (!row.out_success) {
        if (row.out_error_code === 'COOLDOWN_ACTIVE') {
          const nextAtRelative = toRelativeTime(row.out_next_available_at);
          const cdEmbed = cooldownEmbed(
            '복권 재구매 대기 중',
            '조금만 기다리면 다시 구매할 수 있어!',
          )
            .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
            .addFields(
              { name: '⏰ 다음 구매', value: nextAtRelative ?? '곧 다시', inline: true },
              { name: '💳 현재 잔액', value: `**${row.out_new_balance.toLocaleString('ko-KR')}P**`, inline: true },
            )
            .setFooter({ text: '방울냥 · 복권' });

          await interaction.editReply({ embeds: [cdEmbed] });
          return;
        }

        if (row.out_error_code === 'INSUFFICIENT_POINTS') {
          const need = Math.max(0, row.out_ticket_price - row.out_new_balance);
          const insuffEmbed = errorEmbed(
            '포인트가 부족해!',
          )
            .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
            .addFields(
              { name: '🎫 복권 가격', value: `**${row.out_ticket_price.toLocaleString('ko-KR')}P**`, inline: true },
              { name: '💳 현재 잔액', value: `**${row.out_new_balance.toLocaleString('ko-KR')}P**`, inline: true },
              { name: '📉 부족분', value: `**${need.toLocaleString('ko-KR')}P**`, inline: true },
            )
            .setFooter({ text: '방울냥 · 채팅/음성 활동이나 /daily 로 P를 모아봐!' });

          await interaction.editReply({ embeds: [insuffEmbed] });
          return;
        }

        await interaction.editReply({ content: '복권 처리에 실패했어. 잠시 후 다시 시도해줘.' });
        return;
      }

      const tier = toLotteryTier(row.out_tier);
      let jackpotBreakdownLine: string | null = null;
      let jackpotPoolLine: string | null = null;

      const { data: configRow, error: configError } = await ctx.supabase
        .from('app_config')
        .select('lottery_jackpot_base_points, lottery_jackpot_pool_points')
        .eq('id', 1)
        .maybeSingle();

      let jackpotBasePoints = 20000;
      let jackpotPoolPoints = 0;

      if (configError) {
        console.warn('[Lottery] failed to load jackpot config:', configError);
      } else {
        jackpotBasePoints = Math.max(0, Number(configRow?.lottery_jackpot_base_points ?? 20000));
        jackpotPoolPoints = Math.max(0, Number(configRow?.lottery_jackpot_pool_points ?? 0));
      }

      if (tier === 'jackpot') {
        const jackpotAccumulatedPoints = Math.max(0, row.out_payout - jackpotBasePoints);
        jackpotBreakdownLine = `🧾 잭팟 내역: **기본 ${jackpotBasePoints.toLocaleString('ko-KR')} p + 누적금 ${jackpotAccumulatedPoints.toLocaleString('ko-KR')} p**`;
      } else {
        jackpotPoolLine = `🏦 현재 잭팟 누적금: **${jackpotPoolPoints.toLocaleString('ko-KR')} p**`;
      }

      const attachment = await generateLotteryTicketImage({
        tier,
        ticketNumber: row.out_ticket_number,
        ticketPrice: row.out_ticket_price,
        payout: row.out_payout,
        netChange: row.out_net_change
      });

      const fields = [
        { name: '🏷️ 등급', value: `**${TIER_LABELS[tier]}**`, inline: true },
        { name: '💸 구매 비용', value: `**-${row.out_ticket_price.toLocaleString('ko-KR')}P**`, inline: true },
        { name: '💰 당첨금', value: `**+${row.out_payout.toLocaleString('ko-KR')}P**`, inline: true },
      ];

      if (jackpotBreakdownLine) {
        fields.push({ name: '🧾 잭팟 내역', value: `기본 ${jackpotBasePoints.toLocaleString('ko-KR')}P + 누적금 ${Math.max(0, row.out_payout - jackpotBasePoints).toLocaleString('ko-KR')}P`, inline: false });
      }

      if (jackpotPoolLine) {
        fields.push({ name: '🏦 잭팟 누적금', value: `**${jackpotPoolPoints.toLocaleString('ko-KR')}P**`, inline: true });
      }

      fields.push({ name: '📈 순손익', value: `**${signedP(row.out_net_change)}**`, inline: true });

      const resultEmbed = brandEmbed()
        .setColor(TIER_COLORS[tier])
        .setAuthor({ name: interaction.user.displayName, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(TIER_TITLES[tier])
        .setDescription(`🎟️ 티켓 번호: **#${row.out_ticket_number.toString().padStart(6, '0')}**`)
        .addFields(fields)
        .setImage('attachment://lottery-result.png')
        .setFooter({ text: '방울냥 · 다시 도전하려면 /lottery 를 한 번 더!' });

      await interaction.editReply({
        embeds: [resultEmbed],
        files: [attachment]
      });
    } catch (caughtError) {
      console.error('[Lottery] play failed:', caughtError);
      await interaction.editReply({
        content: '복권 처리 중 오류가 발생했어. 잠시 후 다시 시도해줘.'
      });
    }
  }
};
