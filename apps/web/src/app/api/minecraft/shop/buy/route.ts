import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = (await req.json().catch(() => null)) as { uuid?: string; symbol?: string; qty?: number } | null;
  if (!body?.uuid || !body?.symbol || !body?.qty || body.qty <= 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Look up item from market (must be category=seed and enabled)
  const { data: item } = await supabase
    .schema('nyang')
    .from('mc_market_items')
    .select('symbol, display_name, category, enabled, mc_market_prices(current_price)')
    .eq('symbol', body.symbol)
    .eq('enabled', true)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: 'INVALID_ITEM' }, { status: 400 });
  }

  if (item.category !== 'seed') {
    return NextResponse.json({ error: 'NOT_A_SEED' }, { status: 400 });
  }

  const priceRow = Array.isArray(item.mc_market_prices)
    ? item.mc_market_prices[0]
    : item.mc_market_prices;
  const unitPrice: number = priceRow?.current_price ?? 0;
  if (unitPrice <= 0) {
    return NextResponse.json({ error: 'PRICE_UNAVAILABLE' }, { status: 400 });
  }

  const totalCost = unitPrice * body.qty;

  // Get discord_user_id from minecraft_players
  const { data: mcPlayer } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!mcPlayer) {
    return NextResponse.json({ error: 'PLAYER_NOT_FOUND' }, { status: 404 });
  }

  // Check balance
  const { data: bal } = await supabase
    .schema('nyang')
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', mcPlayer.discord_user_id)
    .maybeSingle();

  if (!bal || bal.balance < totalCost) {
    return NextResponse.json({ error: 'INSUFFICIENT_BALANCE' }, { status: 400 });
  }

  // Deduct points
  const { error } = await supabase
    .schema('nyang')
    .from('point_balances')
    .update({ balance: bal.balance - totalCost } as Record<string, unknown>)
    .eq('discord_user_id', mcPlayer.discord_user_id);

  if (error) {
    return NextResponse.json({ error: 'DEDUCT_FAILED' }, { status: 500 });
  }

  // Record point event
  await supabase
    .schema('nyang')
    .from('point_events')
    .insert({
      discord_user_id: mcPlayer.discord_user_id,
      amount: -totalCost,
      kind: `minecraft_shop_buy:${body.symbol}:${body.qty}`,
    });

  return NextResponse.json({
    success: true,
    displayName: item.display_name,
    qty: body.qty,
    unitPrice,
    totalCost,
    newBalance: bal.balance - totalCost,
  });
}
