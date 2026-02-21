import { getBotContext } from '../context.js';

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

type RpcResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;

export async function runStockMarketMakerCycle(): Promise<void> {
  const ctx = getBotContext();
  const rpc = ctx.supabase.rpc.bind(ctx.supabase) as unknown as <T>(
    fn: string,
    args?: Record<string, unknown>
  ) => RpcResult<T>;

  const { data: feeData, error: feeError } = await rpc<ApplyDailyHoldingFeeRpcRow>('apply_daily_stock_holding_fee');
  if (feeError) {
    throw new Error(`[StockMarketMaker] apply_daily_stock_holding_fee failed: ${feeError.message}`);
  }

  const feeRow = Array.isArray(feeData) ? feeData[0] : null;
  if (feeRow?.out_applied) {
    console.info(
      `[StockHoldingFee] applied date=${feeRow.out_fee_date ?? '-'} users=${feeRow.out_charged_users} total=${feeRow.out_total_fee}`
    );
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
