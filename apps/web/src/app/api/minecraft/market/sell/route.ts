import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as {
    uuid?: string;
    symbol?: string;
    qty?: number;
    freshnessPct?: number | null;
    purityPct?: number | null;
  } | null;

  if (!body?.uuid || !body?.symbol || !body?.qty || body.qty <= 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const [{ data: player }, { data: priceRow }, { data: itemRow }, { data: cfg }] = await Promise.all([
    supabase.schema('nyang').from('minecraft_players').select('discord_user_id').eq('minecraft_uuid', body.uuid).maybeSingle(),
    supabase.schema('nyang').from('mc_market_prices').select('current_price').eq('symbol', body.symbol).maybeSingle(),
    supabase.schema('nyang').from('mc_market_items').select('base_price, category').eq('symbol', body.symbol).maybeSingle(),
    supabase.schema('nyang').from('app_config').select('mc_market_fee_bps').eq('id', 1).maybeSingle(),
  ]);

  if (!player) return NextResponse.json({ error: 'PLAYER_NOT_LINKED' }, { status: 404 });
  if (!priceRow || !itemRow) return NextResponse.json({ error: 'ITEM_NOT_FOUND' }, { status: 404 });

  const feeBps = (cfg as Record<string, unknown> | null)?.mc_market_fee_bps as number ?? 500;
  let unitPrice = priceRow.current_price;

  // Apply freshness for crops
  if (itemRow.category === 'crop' && body.freshnessPct != null) {
    const freshMult = 0.6 + (body.freshnessPct / 100) * 0.4;
    unitPrice = Math.round(unitPrice * freshMult);
  }

  // Apply purity for minerals
  if (itemRow.category === 'mineral' && body.purityPct != null) {
    const purityMult = 0.8 + (body.purityPct / 100) * 0.2;
    unitPrice = Math.round(unitPrice * purityMult);
  }

  const grossPoints = unitPrice * body.qty;
  const feeAmount = Math.round(grossPoints * feeBps / 10000);
  const netPoints = grossPoints - feeAmount;

  // Award points via point_events
  const { error: pointError } = await supabase
    .schema('nyang')
    .from('point_events')
    .insert({
      discord_user_id: player.discord_user_id,
      amount: netPoints,
      kind: `minecraft_sell:${body.symbol}:${body.qty}`,
    });

  if (pointError) {
    console.error('[minecraft/market/sell] point error:', pointError);
    return NextResponse.json({ error: 'POINT_ERROR' }, { status: 500 });
  }

  // Record trade
  await supabase.schema('nyang').from('mc_market_trades').insert({
    minecraft_uuid: body.uuid,
    symbol: body.symbol,
    qty: body.qty,
    unit_price: unitPrice,
    base_price: itemRow.base_price,
    freshness_pct: body.freshnessPct ?? null,
    purity_pct: body.purityPct ?? null,
    fee_amount: feeAmount,
    net_points: netPoints,
    side: 'sell',
  });

  return NextResponse.json({ netPoints, unitPrice, feeAmount });
}
