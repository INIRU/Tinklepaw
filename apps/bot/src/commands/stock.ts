import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Message,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';

import type { SlashCommand } from './types.js';
import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { generateStockChartImage } from '../lib/stockChartImage.js';
import { brandEmbed, errorEmbed, Colors, LINE, formatPoints, signedPoints, signedPct as signedPctFmt } from '../lib/embed.js';

type StockCandle = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

type StockDashboardRow = {
  out_symbol: string;
  out_display_name: string;
  out_price: number;
  out_change_pct: number;
  out_fee_bps: number;
  out_balance: number;
  out_holding_qty: number;
  out_holding_avg_price: number;
  out_holding_value: number;
  out_unrealized_pnl: number;
  out_candles: unknown;
};

type StockTradeRow = {
  out_success: boolean;
  out_error_code: string | null;
  out_side: string;
  out_price: number;
  out_qty: number;
  out_gross: number;
  out_fee: number;
  out_settlement: number;
  out_new_balance: number;
  out_holding_qty: number;
  out_holding_avg_price: number;
  out_unrealized_pnl: number;
};

const PANEL_TIMEOUT_MS = 10 * 60 * 1000;
const MODAL_TIMEOUT_MS = 60 * 1000;

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// signedPoints / signedPctFmt imported from embed.js

function parseCandles(raw: unknown): StockCandle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const close = toNumber(row.c);
      const open = toNumber(row.o) || close;
      const high = toNumber(row.h) || Math.max(open, close);
      const low = toNumber(row.l) || Math.min(open, close);
      const volumeBuy = toNumber(row.vb);
      const volumeSell = toNumber(row.vs);

      return {
        t: String(row.t ?? ''),
        o: open,
        h: Math.max(high, open, close),
        l: Math.min(low, open, close),
        c: close,
        v: Math.max(0, volumeBuy + volumeSell),
      };
    })
    .filter((c) => c.t.length > 0 && c.c > 0 && c.h > 0 && c.l > 0);
}

function actionRow(disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('stock:buy')
      .setLabel('매수')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📈')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('stock:sell')
      .setLabel('매도')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('📉')
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('stock:refresh')
      .setLabel('새로고침')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🔄')
      .setDisabled(disabled),
  );
}

function mapTradeError(code: string | null): string {
  switch (code) {
    case 'INVALID_QTY':
      return '수량은 1 이상 숫자로 입력해 주세요.';
    case 'QTY_TOO_LARGE':
      return '한 번에 처리할 수 있는 수량을 초과했어요.';
    case 'INSUFFICIENT_POINTS':
      return '포인트가 부족해서 매수할 수 없어요.';
    case 'INSUFFICIENT_HOLDINGS':
      return '보유 수량이 부족해서 매도할 수 없어요.';
    case 'INVALID_SIDE':
      return '거래 타입이 올바르지 않아요.';
    default:
      return '거래 처리에 실패했어요. 잠시 후 다시 시도해 주세요.';
  }
}

async function fetchDashboard(userId: string) {
  const ctx = getBotContext();
  const rpc = ctx.supabase.rpc.bind(ctx.supabase) as unknown as (
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc('get_stock_dashboard', {
    p_discord_user_id: userId,
  });

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as unknown as StockDashboardRow | null;
  if (!row) throw new Error('STOCK_DASHBOARD_EMPTY');

  return {
    symbol: String(row.out_symbol ?? 'KURO'),
    name: String(row.out_display_name ?? '쿠로 주식'),
    price: toNumber(row.out_price),
    changePct: toNumber(row.out_change_pct),
    feeBps: toNumber(row.out_fee_bps),
    balance: toNumber(row.out_balance),
    holdingQty: toNumber(row.out_holding_qty),
    holdingAvgPrice: toNumber(row.out_holding_avg_price),
    holdingValue: toNumber(row.out_holding_value),
    unrealizedPnl: toNumber(row.out_unrealized_pnl),
    candles: parseCandles(row.out_candles),
  };
}

function tradeResultEmbed(row: StockTradeRow) {
  const isBuy = row.out_side === 'buy';
  const sideLabel = isBuy ? '매수' : '매도';
  const totalLabel = isBuy ? '총 차감' : '총 정산';
  const qty = toNumber(row.out_qty);
  const price = toNumber(row.out_price);
  const settlement = toNumber(row.out_settlement);
  const gross = toNumber(row.out_gross);
  const fee = toNumber(row.out_fee);
  const holdingQty = toNumber(row.out_holding_qty);
  const holdingAvg = toNumber(row.out_holding_avg_price);
  const newBalance = toNumber(row.out_new_balance);
  const unrealizedPnl = toNumber(row.out_unrealized_pnl);

  return brandEmbed()
    .setTitle(`${isBuy ? '🟢' : '🔴'} 주식 ${sideLabel} 체결 완료`)
    .setColor(isBuy ? Colors.SUCCESS : Colors.WARNING)
    .setDescription(
      [
        `**체결 요약**`,
        `> 수량: **${qty.toLocaleString()}주**`,
        `> 체결 단가: **${price.toLocaleString()}P**`,
        `> ${totalLabel}: **${settlement.toLocaleString()}P**`,
      ].join('\n'),
    )
    .addFields(
      { name: '💸 거래 금액', value: formatPoints(gross), inline: true },
      { name: '🧾 수수료', value: formatPoints(fee), inline: true },
      { name: '💳 남은 포인트', value: formatPoints(newBalance), inline: true },
      { name: LINE, value: '\u200b' },
      { name: '📦 보유 수량', value: `\`${holdingQty.toLocaleString()}주\``, inline: true },
      { name: '📌 평균 단가', value: formatPoints(holdingAvg), inline: true },
      { name: '📊 평가손익', value: `\`${signedPoints(unrealizedPnl)}\``, inline: true },
    )
    .setFooter({ text: '패널 자동 새로고침 · 보유 수수료 일 단위 반영' });
}

export const stockCommand: SlashCommand = {
  name: 'stock',
  json: new SlashCommandBuilder()
    .setName('stock')
    .setNameLocalizations({ ko: '주식' })
    .setDescription('주식 패널을 열고 버튼으로 매수/매도합니다.')
    .toJSON(),
  async execute(interaction: ChatInputCommandInteraction) {
    const ctx = getBotContext();
    if (!interaction.guildId || interaction.guildId !== ctx.env.NYARU_GUILD_ID) {
      await interaction.reply({
        content: '이 명령어는 설정된 서버에서만 사용할 수 있어요.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    const userId = interaction.user.id;

    // Cache latest board data so modals can show max qty / fee info instantly
    let cachedBoard: {
      price: number;
      feeBps: number;
      balance: number;
      holdingQty: number;
    } | null = null;

    const renderPanel = async (disabled = false) => {
      const [board, appCfg] = await Promise.all([fetchDashboard(userId), getAppConfig()]);
      cachedBoard = {
        price: board.price,
        feeBps: board.feeBps,
        balance: board.balance,
        holdingQty: board.holdingQty,
      };
      const chart = await generateStockChartImage({
        title: board.name,
        symbol: board.symbol,
        currentPrice: board.price,
        changePct: board.changePct,
        candles: board.candles,
        holdingAvgPrice: board.holdingQty > 0 ? board.holdingAvgPrice : undefined,
      });

      const pctDisplay = signedPctFmt(board.changePct);
      const embed = brandEmbed()
        .setColor(board.changePct >= 0 ? Colors.STOCK_UP : Colors.STOCK_DOWN)
        .setTitle(`📊 ${board.name} · ${board.symbol}`)
        .setDescription(
          [
            `📍 현재가  **${board.price.toLocaleString()}P**  (${pctDisplay})`,
            `📈 평가손익  **${signedPoints(board.unrealizedPnl)}**`,
            `🤖 자동매매 + 뉴스 신호 기반 가격 형성`,
          ].join('\n'),
        )
        .addFields(
          {
            name: '💼 보유 포지션',
            value: `수량 **${board.holdingQty.toLocaleString()}주**\n평단 ${formatPoints(board.holdingAvgPrice)}`,
            inline: true,
          },
          { name: '💰 평가 금액', value: formatPoints(board.holdingValue), inline: true },
          { name: '💳 보유 포인트', value: formatPoints(board.balance), inline: true },
          { name: LINE, value: '\u200b' },
          {
            name: '🧾 수수료',
            value: `거래 ${(board.feeBps / 100).toFixed(2)}%\n보유 일 ${(appCfg.stock_holding_fee_daily_bps / 100).toFixed(2)}% (상한 ${(appCfg.stock_holding_fee_daily_cap_bps / 100).toFixed(2)}%)`,
            inline: true,
          },
          { name: '⚡ 거래', value: '버튼 → 수량 입력 → 즉시 체결', inline: true },
          { name: '🕒 갱신', value: '5분 봉 · 15초 자동 갱신', inline: true },
        )
        .setImage('attachment://stock-chart.png')
        .setFooter({ text: '📊 버튼으로 즉시 거래 가능' });

      await interaction.editReply({
        embeds: [embed],
        components: [actionRow(disabled)],
        files: [chart],
      });
    };

    try {
      await renderPanel(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : '주식 패널을 불러오지 못했습니다.';
      await interaction.editReply({ content: `❌ ${message}`, embeds: [], components: [], files: [] });
      return;
    }

    const reply = await interaction.fetchReply();
    if (!('createMessageComponentCollector' in reply)) return;

    const collector = (reply as Message).createMessageComponentCollector({
      filter: (i: MessageComponentInteraction) =>
        i.user.id === userId && i.customId.startsWith('stock:'),
      time: PANEL_TIMEOUT_MS,
    });

    collector.on('collect', async (buttonInteraction: MessageComponentInteraction) => {
      if (!buttonInteraction.isButton()) return;

      if (buttonInteraction.customId === 'stock:refresh') {
        await buttonInteraction.deferUpdate();
        try {
          await renderPanel(false);
        } catch (e) {
          await interaction.editReply({
            content: `❌ ${e instanceof Error ? e.message : '새로고침에 실패했습니다.'}`,
            embeds: [],
            components: [actionRow(false)],
            files: [],
          });
        }
        return;
      }

      if (buttonInteraction.customId !== 'stock:buy' && buttonInteraction.customId !== 'stock:sell') return;

      const side = buttonInteraction.customId === 'stock:buy' ? 'buy' : 'sell';

      // Build modal with max qty / fee info from cached board
      let qtyLabel = '수량';
      let qtyPlaceholder = '예: 10';

      if (cachedBoard && cachedBoard.price > 0) {
        const board = cachedBoard; // narrow for closures
        const feeRate = board.feeBps / 10000;
        const feePct = (board.feeBps / 100).toFixed(2);

        // Matches DB trade_stock(): impact + floor-fee
        const estimateTrade = (s: 'buy' | 'sell', qty: number) => {
          if (qty <= 0) return { execPrice: board.price, gross: 0, fee: 0, settlement: 0 };
          const p = board.price;
          const impactBps = Math.min(320, Math.max(12, Math.ceil(Math.sqrt(qty) * 12)));
          const delta = Math.max(1, Math.round(p * impactBps / 10000));
          const postPrice = s === 'buy' ? p + delta : Math.max(50, p - delta);
          const execPrice = Math.max(1, Math.round((p + postPrice) / 2));
          const gross = execPrice * qty;
          const fee = Math.max(1, Math.floor(gross * feeRate));
          const settlement = s === 'buy' ? gross + fee : Math.max(gross - fee, 0);
          return { execPrice, gross, fee, settlement };
        };

        if (side === 'buy') {
          // Binary search for max affordable qty (same as web)
          const naiveUpper = Math.max(Math.floor(board.balance / board.price), 0);
          let lo = 0, hi = naiveUpper;
          while (lo < hi) {
            const mid = Math.floor((lo + hi + 1) / 2);
            if (estimateTrade('buy', mid).settlement <= board.balance) lo = mid;
            else hi = mid - 1;
          }
          const maxBuy = lo;
          const est = estimateTrade('buy', maxBuy);

          qtyLabel = `수량 (최대 ${maxBuy.toLocaleString()}주 매수 가능)`;
          qtyPlaceholder = maxBuy > 0
            ? `잔액 ${board.balance.toLocaleString()}P · 예상단가 ${est.execPrice.toLocaleString()}P · 수수료 ${feePct}%`
            : `잔액 ${board.balance.toLocaleString()}P · 포인트가 부족합니다`;
        } else {
          const maxSell = board.holdingQty;
          const est = estimateTrade('sell', maxSell);
          const netSell = est.settlement;

          qtyLabel = `수량 (보유: ${maxSell.toLocaleString()}주)`;
          qtyPlaceholder = maxSell > 0
            ? `전량 매도 시 약 ${netSell.toLocaleString()}P 정산 (수수료 ${feePct}%)`
            : '보유 주식이 없습니다';
        }
      }

      const modalCustomId = `stock:${side}:modal:${buttonInteraction.id}`;
      const modal = new ModalBuilder()
        .setCustomId(modalCustomId)
        .setTitle(side === 'buy' ? '📈 주식 매수' : '📉 주식 매도');

      const quantityInput = new TextInputBuilder()
        .setCustomId('qty')
        .setLabel(qtyLabel)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(qtyPlaceholder)
        .setRequired(true)
        .setMaxLength(9);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      );

      await buttonInteraction.showModal(modal);

      let modalSubmit: ModalSubmitInteraction;
      try {
        modalSubmit = await buttonInteraction.awaitModalSubmit({
          time: MODAL_TIMEOUT_MS,
          filter: (m) => m.customId === modalCustomId && m.user.id === userId,
        });
      } catch {
        return;
      }

      const rawQty = modalSubmit.fields.getTextInputValue('qty').trim();
      const qty = Number.parseInt(rawQty, 10);

      if (!Number.isFinite(qty) || qty <= 0) {
        await modalSubmit.reply({
          content: '수량은 1 이상의 숫자로 입력해 주세요.',
        });
        return;
      }

      await modalSubmit.deferReply();

      const rpc = ctx.supabase.rpc.bind(ctx.supabase) as unknown as (
        fn: string,
        params?: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;

      const { data, error } = await rpc('trade_stock', {
        p_discord_user_id: userId,
        p_side: side,
        p_qty: qty,
      });

      if (error) {
        await modalSubmit.editReply({
          embeds: [
            errorEmbed('거래 실패', error.message || '거래를 처리하지 못했습니다.'),
          ],
        });
        return;
      }

      const trade = (Array.isArray(data) ? data[0] : data) as unknown as StockTradeRow | null;
      if (!trade || !trade.out_success) {
        await modalSubmit.editReply({
          embeds: [
            errorEmbed('거래 실패', mapTradeError(trade?.out_error_code ?? null)),
          ],
        });
        await renderPanel(false).catch(() => {});
        return;
      }

      await modalSubmit.editReply({ embeds: [tradeResultEmbed(trade)] });
      await renderPanel(false).catch(() => {});
    });

    collector.on('end', () => {
      renderPanel(true).catch(() => {});
    });
  },
};
