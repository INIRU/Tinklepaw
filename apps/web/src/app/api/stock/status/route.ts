import { NextResponse } from 'next/server';

import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';

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

export async function GET() {
  const gate = await requireGuildMemberApi();
  if (isResponse(gate)) return gate;

  const userId = gate.session.user.id;
  const supabase = createSupabaseAdminClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    params?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc('get_stock_dashboard', {
    p_discord_user_id: userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message, code: 'STOCK_DASHBOARD_FAILED' }, { status: 400 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as unknown as DashboardRow | null;
  if (!row) {
    return NextResponse.json({ error: 'STOCK_DASHBOARD_EMPTY' }, { status: 500 });
  }

  const cfg = await getOrInitAppConfig();
  const cfgAny = cfg as Record<string, unknown>;

  return NextResponse.json({
    ...normalizeDashboard(row),
    holdingFeeDailyBps: Number(cfgAny.stock_holding_fee_daily_bps ?? 8),
    holdingFeeCapBps: Number(cfgAny.stock_holding_fee_daily_cap_bps ?? 20),
    holdingFeeEnabled: Boolean(cfgAny.stock_holding_fee_enabled ?? true),
  });
}
