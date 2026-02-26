import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

const SEED_SHOP: Record<string, { price: number; displayName: string }> = {
  wheat_seeds:    { price: 5,  displayName: '밀 씨앗' },
  potato:         { price: 7,  displayName: '감자' },
  carrot:         { price: 8,  displayName: '당근' },
  sugar_cane:     { price: 6,  displayName: '사탕수수' },
  beetroot_seeds: { price: 10, displayName: '비트루트 씨앗' },
  melon_seeds:    { price: 12, displayName: '수박 씨앗' },
  pumpkin_seeds:  { price: 12, displayName: '호박 씨앗' },
  cocoa_beans:    { price: 15, displayName: '코코아 씨앗' },
};

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = (await req.json().catch(() => null)) as { uuid?: string; symbol?: string; qty?: number } | null;
  if (!body?.uuid || !body?.symbol || !body?.qty || body.qty <= 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const shopItem = SEED_SHOP[body.symbol];
  if (!shopItem) {
    return NextResponse.json({ error: 'INVALID_ITEM' }, { status: 400 });
  }

  const totalCost = shopItem.price * body.qty;
  const supabase = createSupabaseAdminClient();

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
    displayName: shopItem.displayName,
    qty: body.qty,
    totalCost,
    newBalance: bal.balance - totalCost,
  });
}
