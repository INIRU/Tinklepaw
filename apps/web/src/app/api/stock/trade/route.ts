import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

type DashboardRow = {
  out_symbol: string | null;
  out_display_name: string | null;
  out_price: number | string | null;
  out_change_pct: number | string | null;
  out_fee_bps: number | string | null;
  out_balance: number | string | null;
  out_holding_qty: number | string | null;
  out_holding_avg_price: number | string | null;
  out_holding_value: number | string | null;
  out_unrealized_pnl: number | string | null;
  out_candles: unknown;
};

type TradeRow = {
  out_success: boolean | null;
  out_error_code: string | null;
  out_side: string | null;
  out_price: number | string | null;
  out_qty: number | string | null;
  out_gross: number | string | null;
  out_fee: number | string | null;
  out_settlement: number | string | null;
  out_new_balance: number | string | null;
  out_holding_qty: number | string | null;
  out_holding_avg_price: number | string | null;
  out_unrealized_pnl: number | string | null;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDashboard(raw: DashboardRow | null | undefined) {
  const candlesRaw = Array.isArray(raw?.out_candles) ? raw.out_candles : [];
  const candles = candlesRaw
    .map((entry) => {
      const row = entry as Record<string, unknown>;
      const c = toSafeNumber(row.c);
      const o = toSafeNumber(row.o, c);
      const h = toSafeNumber(row.h, Math.max(o, c));
      const l = toSafeNumber(row.l, Math.min(o, c));
      const vb = toSafeNumber(row.vb);
      const vs = toSafeNumber(row.vs);
      return {
        t: String(row.t ?? ''),
        o,
        h: Math.max(h, o, c),
        l: Math.min(l, o, c),
        c,
        v: Math.max(0, vb + vs),
      };
    })
    .filter((row) => row.t.length > 0 && row.c > 0 && row.h > 0 && row.l > 0);

  return {
    symbol: raw?.out_symbol ?? 'KURO',
    displayName: raw?.out_display_name ?? '쿠로 주식',
    price: toSafeNumber(raw?.out_price, 0),
    changePct: toSafeNumber(raw?.out_change_pct, 0),
    feeBps: toSafeNumber(raw?.out_fee_bps, 150),
    balance: toSafeNumber(raw?.out_balance, 0),
    holdingQty: toSafeNumber(raw?.out_holding_qty, 0),
    holdingAvgPrice: toSafeNumber(raw?.out_holding_avg_price, 0),
    holdingValue: toSafeNumber(raw?.out_holding_value, 0),
    unrealizedPnl: toSafeNumber(raw?.out_unrealized_pnl, 0),
    candles,
  };
}

function normalizeTrade(raw: TradeRow | null | undefined) {
  return {
    success: Boolean(raw?.out_success),
    errorCode: raw?.out_error_code ?? null,
    side: raw?.out_side ?? null,
    price: toSafeNumber(raw?.out_price, 0),
    qty: toSafeNumber(raw?.out_qty, 0),
    gross: toSafeNumber(raw?.out_gross, 0),
    fee: toSafeNumber(raw?.out_fee, 0),
    settlement: toSafeNumber(raw?.out_settlement, 0),
    newBalance: toSafeNumber(raw?.out_new_balance, 0),
    holdingQty: toSafeNumber(raw?.out_holding_qty, 0),
    holdingAvgPrice: toSafeNumber(raw?.out_holding_avg_price, 0),
    unrealizedPnl: toSafeNumber(raw?.out_unrealized_pnl, 0),
  };
}

function mapTradeError(code: string | null): string {
  switch (code) {
    case 'INVALID_QTY':
      return '수량은 1 이상이어야 합니다.';
    case 'QTY_TOO_LARGE':
      return '한 번에 처리 가능한 수량을 초과했습니다.';
    case 'INSUFFICIENT_POINTS':
      return '포인트가 부족합니다.';
    case 'INSUFFICIENT_HOLDINGS':
      return '보유 수량이 부족합니다.';
    case 'INVALID_SIDE':
      return '거래 타입이 올바르지 않습니다.';
    default:
      return '거래를 처리하지 못했습니다.';
  }
}

export async function POST(req: Request) {
  const gate = await requireGuildMemberApi();
  if (isResponse(gate)) return gate;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const side = String(body.side ?? '').toLowerCase();
  const qty = Math.trunc(Number(body.qty));

  if (side !== 'buy' && side !== 'sell') {
    return NextResponse.json({ error: 'INVALID_SIDE' }, { status: 400 });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: 'INVALID_QTY' }, { status: 400 });
  }

  const userId = gate.session.user.id;
  const supabase = createSupabaseAdminClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc('trade_stock', {
    p_discord_user_id: userId,
    p_side: side,
    p_qty: qty,
  });

  if (error) {
    return NextResponse.json({ error: error.message, code: 'TRADE_FAILED' }, { status: 400 });
  }

  const tradeRow = (Array.isArray(data) ? data[0] : data) as unknown as TradeRow | null;
  const trade = normalizeTrade(tradeRow);
  if (!trade.success) {
    return NextResponse.json(
      { error: mapTradeError(trade.errorCode), code: trade.errorCode, trade },
      { status: 400 },
    );
  }

  const { data: dashboardData, error: dashboardError } = await rpc('get_stock_dashboard', {
    p_discord_user_id: userId,
  });

  if (dashboardError) {
    return NextResponse.json({ success: true, trade, dashboard: null });
  }

  const dashboardRow = (Array.isArray(dashboardData) ? dashboardData[0] : dashboardData) as unknown as DashboardRow | null;
  return NextResponse.json({
    success: true,
    trade,
    dashboard: normalizeDashboard(dashboardRow),
  });
}
