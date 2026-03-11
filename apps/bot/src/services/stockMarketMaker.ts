import type { Client } from 'discord.js';
import { getBotContext } from '../context.js';
import { Colors, stockEmbed, stockFooter } from '../lib/embed.js';

type RunStockMarketMakerRpcRow = {
  out_applied: boolean;
  out_bucket_start: string | null;
  out_side: 'buy' | 'sell' | null;
  out_qty: number;
  out_impact_bps: number;
  out_price_before: number;
  out_price_after: number;
};

type ApplyDailyHoldingFeeRpcRow = {
  out_applied: boolean;
  out_fee_date: string | null;
  out_charged_users: number;
  out_total_fee: number;
};

type FeeEventRow = {
  discord_user_id: string;
  holding_qty: number;
  mark_price: number;
  holding_value: number;
  fee_bps: number;
  fee_amount: number;
  balance_after: number;
  metadata: {
    forced_sell_qty?: number;
    forced_sell_proceeds?: number;
    fee_requested?: number;
  };
};

type RpcResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

async function sendHoldingFeeDms(client: Client, feeDate: string): Promise<void> {
  const ctx = getBotContext();

  const { data: rows, error } = await ctx.supabase
    .from('stock_holding_fee_events')
    .select('discord_user_id, holding_qty, mark_price, holding_value, fee_bps, fee_amount, balance_after, metadata')
    .eq('fee_date', feeDate);

  if (error || !rows?.length) return;

  for (const row of rows as FeeEventRow[]) {
    try {
      const user = await client.users.fetch(row.discord_user_id);
      const forcedQty = row.metadata?.forced_sell_qty ?? 0;
      const forcedProceeds = row.metadata?.forced_sell_proceeds ?? 0;

      const embed = stockEmbed()
        .setColor(Colors.WARNING)
        .setTitle('📊 주식 보유 수수료 차감')
        .setDescription(
          [
            `**${feeDate}** 기준 KURO 주식 보유 수수료가 차감되었습니다.`,
            `───────────────────────`,
            `💼 보유  **${fmt(row.holding_qty)}주** · 기준가  **${fmt(row.mark_price)} P**`,
            `평가액  **${fmt(row.holding_value)} P**`,
            `───────────────────────`,
            `🧾 요율  **${row.fee_bps}bps** (${(row.fee_bps / 100).toFixed(2)}%)`,
            `차감  **-${fmt(row.fee_amount)} P**`,
            `잔액  **${fmt(row.balance_after)} P**`,
          ].join('\n'),
        )
        .setFooter(stockFooter());

      if (forcedQty > 0) {
        embed.addFields({
          name: '🚨 강제 청산',
          value: [
            `잔액 부족으로 **${fmt(forcedQty)}주**가 자동 매도되었습니다.`,
            `청산 수익: **+${fmt(forcedProceeds)} P** (기준가 ${fmt(row.mark_price)} P)`,
          ].join('\n'),
        });
      }

      await user.send({ embeds: [embed] });
    } catch {
      // DM disabled or user not found — silently skip
    }
  }
}

export async function runStockMarketMakerCycle(client: Client): Promise<void> {
  const ctx = getBotContext();
  const rpc = ctx.supabase.rpc.bind(ctx.supabase) as unknown as <T>(
    fn: string,
    args?: Record<string, unknown>
  ) => RpcResult<T>;

  // Check for admin-requested force run
  const appCfgRaw = await ctx.supabase.from('app_config').select('stock_holding_fee_force_run_at').eq('id', 1).maybeSingle();
  const forceRunAt = (appCfgRaw.data as Record<string, unknown> | null)?.stock_holding_fee_force_run_at as string | null | undefined;
  const isForceRun = Boolean(forceRunAt && (Date.now() - new Date(forceRunAt).getTime()) < 5 * 60 * 1000);

  if (isForceRun) {
    // Reset the daily gate so the RPC will execute
    await ctx.supabase.from('app_config').update({ stock_holding_fee_last_applied_on: null, stock_holding_fee_force_run_at: null } as Record<string, unknown>).eq('id', 1);
  }

  const { data: feeData, error: feeError } = await rpc<ApplyDailyHoldingFeeRpcRow>('apply_daily_stock_holding_fee');
  if (feeError) {
    console.warn(`[StockMarketMaker] apply_daily_stock_holding_fee skipped: ${feeError.message}`);
  }

  if (!feeError) {
    const feeRow = Array.isArray(feeData) ? feeData[0] : null;
    if (feeRow?.out_applied && feeRow.out_fee_date) {
      console.info(
        `[StockHoldingFee] applied date=${feeRow.out_fee_date} users=${feeRow.out_charged_users} total=${feeRow.out_total_fee}`
      );
      // Send DMs asynchronously — don't block the market-maker cycle
      sendHoldingFeeDms(client, feeRow.out_fee_date).catch((e) =>
        console.error('[StockHoldingFee] DM send failed:', e)
      );
    }
  }

  const { data, error } = await rpc<RunStockMarketMakerRpcRow>('run_stock_market_maker');
  if (error) {
    throw new Error(`[StockMarketMaker] run_stock_market_maker failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.out_applied || !row.out_side) return;

  console.info(
    `[StockMarketMaker] ${row.out_side.toUpperCase()} qty=${row.out_qty} impact=${row.out_impact_bps}bps ` +
      `price=${row.out_price_before}->${row.out_price_after}`
  );
}
