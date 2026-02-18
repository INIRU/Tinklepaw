import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

type ExchangePointsRow = {
  out_success: boolean | null;
  out_error_code: string | null;
  out_points_spent: number | string | null;
  out_nyang_received: number | string | null;
  out_new_point_balance: number | string | null;
  out_new_nyang_balance: number | string | null;
};

type ExchangeNyangRow = {
  out_success: boolean | null;
  out_error_code: string | null;
  out_nyang_spent: number | string | null;
  out_points_received: number | string | null;
  out_new_point_balance: number | string | null;
  out_new_nyang_balance: number | string | null;
  out_rate_nyang_per_point: number | string | null;
};

type DashboardRow = {
  out_symbol: string | null;
  out_display_name: string | null;
  out_price: number | string | null;
  out_change_pct: number | string | null;
  out_fee_bps: number | string | null;
  out_balance: number | string | null;
  out_point_balance: number | string | null;
  out_holding_qty: number | string | null;
  out_holding_avg_price: number | string | null;
  out_holding_value: number | string | null;
  out_unrealized_pnl: number | string | null;
  out_candles: unknown;
};

function toSafeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapExchangeError(code: string | null): string {
  switch (code) {
    case 'INVALID_POINTS':
      return '환전 포인트는 1 이상이어야 합니다.';
    case 'INVALID_NYANG':
      return '환전 냥은 1 이상이어야 합니다.';
    case 'POINTS_TOO_LARGE':
      return '한 번에 환전할 수 있는 포인트를 초과했습니다.';
    case 'NYANG_TOO_LARGE':
      return '한 번에 환전할 수 있는 냥을 초과했습니다.';
    case 'AMOUNT_TOO_SMALL':
      return '100냥 이상부터 포인트로 환전할 수 있습니다.';
    case 'INSUFFICIENT_POINTS':
      return '포인트가 부족합니다.';
    case 'INSUFFICIENT_NYANG':
      return '냥이 부족합니다.';
    default:
      return '환전에 실패했습니다.';
  }
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
    pointBalance: toSafeNumber(raw?.out_point_balance, 0),
    holdingQty: toSafeNumber(raw?.out_holding_qty, 0),
    holdingAvgPrice: toSafeNumber(raw?.out_holding_avg_price, 0),
    holdingValue: toSafeNumber(raw?.out_holding_value, 0),
    unrealizedPnl: toSafeNumber(raw?.out_unrealized_pnl, 0),
    candles,
  };
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
  const direction = body.direction === 'nyang_to_points' ? 'nyang_to_points' : 'points_to_nyang';
  const amount = Math.trunc(
    Number(direction === 'points_to_nyang' ? (body.points ?? body.amount) : (body.nyang ?? body.amount)),
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: direction === 'points_to_nyang' ? 'INVALID_POINTS' : 'INVALID_NYANG' }, { status: 400 });
  }

  const userId = gate.session.user.id;
  const supabase = createSupabaseAdminClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = direction === 'points_to_nyang'
    ? await rpc('exchange_points_to_nyang', {
        p_discord_user_id: userId,
        p_points: amount,
      })
    : await rpc('exchange_nyang_to_points', {
        p_discord_user_id: userId,
        p_nyang: amount,
      });

  if (error) {
    return NextResponse.json({ error: error.message, code: 'EXCHANGE_FAILED' }, { status: 400 });
  }

  const raw = Array.isArray(data) ? data[0] : data;
  const exchange = direction === 'points_to_nyang'
    ? (() => {
        const row = raw as ExchangePointsRow | null;
        return {
          direction,
          success: Boolean(row?.out_success),
          errorCode: row?.out_error_code ?? null,
          pointsSpent: toSafeNumber(row?.out_points_spent, 0),
          pointsReceived: 0,
          nyangSpent: 0,
          nyangReceived: toSafeNumber(row?.out_nyang_received, 0),
          rateNyangPerPoint: 1,
          pointBalance: toSafeNumber(row?.out_new_point_balance, 0),
          nyangBalance: toSafeNumber(row?.out_new_nyang_balance, 0),
        };
      })()
    : (() => {
        const row = raw as ExchangeNyangRow | null;
        return {
          direction,
          success: Boolean(row?.out_success),
          errorCode: row?.out_error_code ?? null,
          pointsSpent: 0,
          pointsReceived: toSafeNumber(row?.out_points_received, 0),
          nyangSpent: toSafeNumber(row?.out_nyang_spent, 0),
          nyangReceived: 0,
          rateNyangPerPoint: Math.max(1, toSafeNumber(row?.out_rate_nyang_per_point, 100)),
          pointBalance: toSafeNumber(row?.out_new_point_balance, 0),
          nyangBalance: toSafeNumber(row?.out_new_nyang_balance, 0),
        };
      })();

  if (!exchange.success) {
    return NextResponse.json(
      { error: mapExchangeError(exchange.errorCode), code: exchange.errorCode, exchange },
      { status: 400 },
    );
  }

  const { data: dashboardData, error: dashboardError } = await rpc('get_stock_dashboard', {
    p_discord_user_id: userId,
  });

  if (dashboardError) {
    return NextResponse.json({ success: true, exchange, dashboard: null });
  }

  const dashboardRow = (Array.isArray(dashboardData) ? dashboardData[0] : dashboardData) as DashboardRow | null;

  return NextResponse.json({
    success: true,
    exchange,
    dashboard: normalizeDashboard(dashboardRow),
  });
}
