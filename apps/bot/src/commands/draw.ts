import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  type MessageComponentInteraction,
  type Collection,
} from 'discord.js';

import type { ChatInputCommandInteraction } from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { generateGachaResultImage } from '../lib/gachaImage.js';
import { getAppConfig, type AppConfig } from '../services/config.js';

type GachaDrawResult = {
  out_item_id: string;
  out_name: string;
  out_rarity: 'R' | 'S' | 'SS' | 'SSS';
  out_discord_role_id: string | null;
  out_is_free: boolean;
  out_refund_points: number;
  out_reward_points?: number;
  reward_points?: number;
  out_is_variant?: boolean;
  out_new_balance: number;
};

export async function triggerGachaUI(
  context: ChatInputCommandInteraction | Message,
) {
  const ctx = getBotContext();
  const botConfig: AppConfig = await getAppConfig().catch(() => ({
    gacha_embed_title: '🎰 가챠 뽑기',
    gacha_embed_color: '#5865F2',
    gacha_embed_description: null,
    bot_sync_interval_ms: 5000,
    gacha_processing_title: '🎲 뽑는 중...',
    gacha_processing_description: '{drawCount}회 뽑기를 진행하고 있습니다...',
    gacha_result_title: '🎉 {drawCount}회 뽑기 결과',
    reward_points_per_interval: 0,
    reward_interval_seconds: 60,
    reward_daily_cap_points: null,
    reward_min_message_length: 0,
    booster_chat_bonus_points: 0,
    voice_reward_points_per_interval: 0,
    voice_reward_interval_seconds: 60,
    voice_reward_daily_cap_points: null,
    booster_voice_bonus_points: 0,
    error_log_channel_id: null,
    show_traceback_to_user: true,
  }));

  const userId =
    context instanceof Message ? context.author.id : context.user.id;
  const guild = context.guild;

  if (!context.guildId || context.guildId !== ctx.env.NYARU_GUILD_ID) {
    const msg = 'This command is only available in the configured server.';
    if (context instanceof Message) {
      await context.reply(msg);
    } else {
      await context.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  type PoolRow = {
    pool_id: string;
    name: string;
    kind: 'permanent' | 'limited';
    banner_image_url: string | null;
    cost_points: number;
    rate_r: number;
    rate_s: number;
    rate_ss: number;
    rate_sss: number;
    pity_threshold: number | null;
    pity_rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
    start_at?: string | null;
    end_at?: string | null;
  };

  const { data: poolsRaw } = await ctx.supabase
    .from('gacha_pools')
    .select(
      'pool_id, name, kind, banner_image_url, cost_points, rate_r, rate_s, rate_ss, rate_sss, pity_threshold, pity_rarity, start_at, end_at',
    )
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  const pools = poolsRaw as unknown as PoolRow[] | null;

  const nowMs = Date.now();
  const activePools = (pools ?? []).filter((p) => {
    const startAt = (p as { start_at?: string | null }).start_at;
    const endAt = (p as { end_at?: string | null }).end_at;
    const startOk = !startAt || new Date(startAt).getTime() <= nowMs;
    const endOk = !endAt || new Date(endAt).getTime() > nowMs;
    return startOk && endOk;
  });

  if (activePools.length === 0) {
    const msg = '활성화된 뽑기 풀이 없습니다.';
    if (context instanceof Message) {
      await context.reply(msg);
    } else {
      await context.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  let currentIndex = 0;

  // 색상 문자열을 숫자로 변환하는 헬퍼 함수
  const parseColor = (color: string | undefined): number => {
    if (!color) return 0x5865f2;
    if (color.startsWith('#')) {
      return parseInt(color.slice(1), 16);
    }
    return parseInt(color, 16) || 0x5865f2;
  };

  const showPool = async (
    index: number,
    isEdit = false,
  ): Promise<Message | null> => {
    const pool = activePools[index];

    const { data: poolItemIds } = await ctx.supabase
      .from('gacha_pool_items')
      .select('item_id')
      .eq('pool_id', pool.pool_id);

    const itemIds = (poolItemIds ?? []).map((pi) => pi.item_id);

    const { data: items } = await ctx.supabase
      .from('items')
      .select('name, rarity, discord_role_id')
      .in('item_id', itemIds);

    const itemsByRarity = {
      SSS: [] as string[],
      SS: [] as string[],
      S: [] as string[],
      R: [] as string[],
    };

    (items ?? []).forEach((item) => {
      if (item.rarity in itemsByRarity) {
        const roleMention = item.discord_role_id
          ? `<@&${item.discord_role_id}>`
          : item.name;
        itemsByRarity[item.rarity as keyof typeof itemsByRarity].push(
          roleMention,
        );
      }
    });

    const rarityDisplay = [
      `**SSS (${pool.rate_sss}%)**: ${itemsByRarity.SSS.join(', ') || '없음'}`,
      `**SS (${pool.rate_ss}%)**: ${itemsByRarity.SS.join(', ') || '없음'}`,
      `**S (${pool.rate_s}%)**: ${itemsByRarity.S.join(', ') || '없음'}`,
      `**R (${pool.rate_r}%)**: ${itemsByRarity.R.join(', ') || '없음'}`,
    ].join('\n\n');

    const { data: balanceData } = await ctx.supabase
      .from('point_balances')
      .select('balance')
      .eq('discord_user_id', userId)
      .single();

    const currentPoints = balanceData?.balance ?? 0;

    const { data: userState } = await ctx.supabase
      .from('gacha_user_state')
      .select('pity_counter')
      .eq('discord_user_id', userId)
      .eq('pool_id', pool.pool_id)
      .single();

    const pityCounter = userState?.pity_counter ?? 0;

    let pityInfo = '';
    if (pool.pity_threshold && pool.pity_rarity) {
      const remaining = pool.pity_threshold - pityCounter;
      pityInfo = `\n천장: **${pityCounter}/${pool.pity_threshold}** (${remaining}회 남음, ${pool.pity_rarity} 확정)`;
    }

    const startAtIso = (pool as { start_at?: string | null }).start_at ?? null;
    const endAtIso = (pool as { end_at?: string | null }).end_at ?? null;
    const startUnix = startAtIso ? Math.floor(new Date(startAtIso).getTime() / 1000) : null;
    const endUnix = endAtIso ? Math.floor(new Date(endAtIso).getTime() / 1000) : null;
    let periodInfo = '';
    if (pool.kind === 'limited' && (startUnix || endUnix)) {
      if (startUnix && endUnix) {
        periodInfo = `\n기간: <t:${startUnix}:f> ~ <t:${endUnix}:f> (종료 <t:${endUnix}:R>)`;
      } else if (endUnix) {
        periodInfo = `\n기간: ~ <t:${endUnix}:f> (종료 <t:${endUnix}:R>)`;
      } else if (startUnix) {
        periodInfo = `\n기간: <t:${startUnix}:f> ~`;
      }
    }

    const template =
      (botConfig.gacha_embed_description as string) ||
      '현재 포인트: **{points}p**\n1회 뽑기 비용: **{cost1}p**\n10회 뽑기 비용: **{cost10}p**{pity}{period}\n\n**확률표 & 획득 가능 역할**\n{rarityDisplay}';

    let embedDescription = template
      .replace('{points}', currentPoints.toLocaleString())
      .replace('{cost1}', pool.cost_points.toLocaleString())
      .replace('{cost10}', (pool.cost_points * 10).toLocaleString())
      .replace('{pity}', pityInfo)
      .replace('{period}', periodInfo)
      .replace('{rarityDisplay}', rarityDisplay);

    if (!template.includes('{period}') && periodInfo) {
      embedDescription += periodInfo;
    }

    const embed = new EmbedBuilder()
      .setTitle(botConfig.gacha_embed_title || `🎰 ${pool.name}`)
      .setDescription(
        `${embedDescription}\n\n💡 **더 멋진 연출과 편리한 조작은 [웹사이트](https://tinklepaw.vercel.app/draw)에서!**`,
      )
      .setImage(
        pool.banner_image_url ||
          'https://via.placeholder.com/800x300?text=Gacha+Banner',
      )
      .setColor(parseColor(botConfig.gacha_embed_color))
      .setFooter({ text: `풀 ${index + 1} / ${activePools.length}` });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('prev')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activePools.length === 1),
      new ButtonBuilder()
        .setCustomId('draw1')
        .setLabel('1회 뽑기')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('draw10')
        .setLabel('10회 뽑기')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('next')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activePools.length === 1),
    );

    if (isEdit) {
      if (!(context instanceof Message)) {
        await context.editReply({ embeds: [embed], components: [buttons] });
      }
      return null;
    } else {
      if (context instanceof Message) {
        return await context.reply({ embeds: [embed], components: [buttons] });
      } else {
        const reply = await context.reply({
          embeds: [embed],
          components: [buttons],
          withResponse: true,
        });
        return reply.resource?.message ?? null;
      }
    }
  };

  const initialReply = await showPool(currentIndex);
  if (!initialReply) return;

  const collector =
    'createMessageComponentCollector' in initialReply
      ? (initialReply as Message).createMessageComponentCollector({
          filter: (i: MessageComponentInteraction) => i.user.id === userId,
          time: 60000,
        })
      : null;

  if (!collector) return;

  collector.on(
    'collect',
    async (buttonInteraction: MessageComponentInteraction) => {
      if (buttonInteraction.customId === 'prev') {
        currentIndex = (currentIndex - 1 + activePools.length) % activePools.length;
        await buttonInteraction.deferUpdate();
        await showPool(currentIndex, true);
      } else if (buttonInteraction.customId === 'next') {
        currentIndex = (currentIndex + 1) % activePools.length;
        await buttonInteraction.deferUpdate();
        await showPool(currentIndex, true);
      } else if (
        buttonInteraction.customId === 'draw1' ||
        buttonInteraction.customId === 'draw10'
      ) {
        const selectedPool = activePools[currentIndex];
        const drawCount = buttonInteraction.customId === 'draw10' ? 10 : 1;

        const processingTitle = botConfig.gacha_processing_title.replace(
          '{drawCount}',
          drawCount.toString(),
        );
        const processingDesc = botConfig.gacha_processing_description.replace(
          '{drawCount}',
          drawCount.toString(),
        );

        await buttonInteraction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle(processingTitle)
              .setDescription(processingDesc)
              .setColor(parseColor(botConfig.gacha_embed_color)),
          ],
          components: [],
        });
        collector.stop();

        const results: Array<{
          name: string;
          rarity: 'R' | 'S' | 'SS' | 'SSS';
          refund_points?: number;
          discord_role_id?: string | null;
          reward_points?: number;
          is_variant?: boolean;
        }> = [];
        const errors: string[] = [];

        for (let i = 0; i < drawCount; i++) {
          const { data, error } = await ctx.supabase.rpc('perform_gacha_draw', {
            p_discord_user_id: userId,
            p_pool_id: selectedPool.pool_id,
          });

          if (error) {
            let errorMsg = error.message || error.code || '알 수 없는 오류';
            if (errorMsg.includes('INSUFFICIENT_POINTS')) {
              errorMsg = `포인트 부족`;
              errors.push(`${i + 1}회: ${errorMsg}`);
              break;
            } else if (errorMsg.includes('NO_ACTIVE_POOL')) {
              errorMsg = '활성화된 뽑기 풀이 없습니다.';
              errors.push(`${i + 1}회: ${errorMsg}`);
              break;
            } else if (errorMsg.includes('PAID_COOLDOWN')) {
              errorMsg = '쿨다운 중';
              errors.push(`${i + 1}회: ${errorMsg}`);
              break;
            } else {
              errors.push(`${i + 1}회: ${errorMsg}`);
              continue;
            }
          }

          const rawRow = Array.isArray(data) ? data[0] : data;
          const row = rawRow as unknown as GachaDrawResult | undefined;

          if (row) {
            let displayName = row.out_name;
            if (row.out_discord_role_id && guild) {
              try {
                const role = await guild.roles.fetch(row.out_discord_role_id);
                if (role) displayName = role.name;
              } catch (e) {
                console.warn(
                  '[Draw] Failed to fetch role name:',
                  row.out_discord_role_id,
                  e,
                );
              }
            }
            results.push({
              name: displayName,
              rarity: row.out_rarity,
              discord_role_id: row.out_discord_role_id,
              refund_points: row.out_refund_points,
              reward_points: row.out_reward_points ?? row.reward_points ?? 0,
              is_variant: Boolean(row.out_is_variant),
            });
          }
        }

        if (results.length === 0) {
          const errorSummary =
            errors.length > 0 ? `\n\n오류: ${errors.join(', ')}` : '';
          await buttonInteraction.editReply({
            embeds: [],
            components: [],
            content: `뽑기 실패: 결과가 없습니다.${errorSummary}`,
          });
          return;
        }

        const resultsByRarity = {
          SSS: [] as typeof results,
          SS: [] as typeof results,
          S: [] as typeof results,
          R: [] as typeof results,
        };
        results.forEach((r) => {
          if (r.rarity in resultsByRarity)
            resultsByRarity[r.rarity as keyof typeof resultsByRarity].push(r);
        });

        const resultLines: string[] = [];
        (['SSS', 'SS', 'S', 'R'] as const).forEach((rarity) => {
          const items = resultsByRarity[rarity];
          if (items.length > 0) {
            const itemNames = items
              .map((item) => {
                const displayName = item.discord_role_id
                  ? `<@&${item.discord_role_id}>`
                  : `**${item.name}**`;
                const variantText = item.is_variant ? ' ✨변동' : '';
                const rewardText =
                  !item.discord_role_id && (item.reward_points ?? 0) > 0
                    ? ` (포인트 +${item.reward_points}p)`
                    : !item.discord_role_id
                      ? ' (꽝)'
                      : '';
                const refundText = item.refund_points ? ` (중복 +${item.refund_points}p)` : '';
                return `${displayName}${variantText}${rewardText}${refundText}`;
              })
              .join(', ');
            resultLines.push(`**${rarity}**: ${itemNames}`);
          }
        });

        const resultImage = await generateGachaResultImage(
          results,
          selectedPool.name,
        );
        const resultTitle = botConfig.gacha_result_title.replace(
          '{drawCount}',
          drawCount.toString(),
        );
        const resultEmbed = new EmbedBuilder()
          .setTitle(resultTitle)
          .setDescription(resultLines.join('\n\n') || '결과 없음')
          .setImage('attachment://gacha-result.png')
          .setColor(parseColor(botConfig.gacha_embed_color));

        await buttonInteraction.editReply({
          embeds: [resultEmbed],
          components: [],
          files: [resultImage],
        });
      }
    },
  );

  collector.on(
    'end',
    (collected: Collection<string, MessageComponentInteraction>) => {
      if (collected.size === 0) {
        if (context instanceof Message) {
          initialReply
            .edit({
              embeds: [],
              components: [],
              content:
                '⏱️ 시간이 초과되었습니다. 다시 `/뽑기` 명령어를 사용해주세요.',
            })
            .catch(() => {});
        } else {
          context
            .editReply({
              embeds: [],
              components: [],
              content:
                '⏱️ 시간이 초과되었습니다. 다시 `/뽑기` 명령어를 사용해주세요.',
            })
            .catch(() => {});
        }
      }
    },
  );
}

export const drawCommand: SlashCommand = {
  name: 'draw',
  json: new SlashCommandBuilder()
    .setName('draw')
    .setNameLocalizations({ ko: '뽑기' })
    .setDescription('가챠를 돌려 역할을 뽑습니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    await triggerGachaUI(interaction);
  },
};
