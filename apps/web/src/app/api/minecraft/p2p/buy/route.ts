import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string; listingId?: number } | null;
  if (!body?.uuid || !body?.listingId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: listing } = await supabase
    .schema('nyang')
    .from('mc_p2p_listings')
    .select('id, seller_uuid, symbol, qty, price_per_unit, status')
    .eq('id', body.listingId)
    .maybeSingle();

  if (!listing) return NextResponse.json({ error: 'LISTING_NOT_FOUND' }, { status: 404 });
  if (listing.status !== 'open') return NextResponse.json({ error: 'LISTING_NOT_OPEN' }, { status: 400 });
  if (listing.seller_uuid === body.uuid) return NextResponse.json({ error: 'CANNOT_BUY_OWN' }, { status: 400 });

  const totalCost = listing.qty * listing.price_per_unit;

  const [{ data: buyer }, { data: seller }] = await Promise.all([
    supabase.schema('nyang').from('minecraft_players').select('discord_user_id').eq('minecraft_uuid', body.uuid).maybeSingle(),
    supabase.schema('nyang').from('minecraft_players').select('discord_user_id').eq('minecraft_uuid', listing.seller_uuid).maybeSingle(),
  ]);

  if (!buyer) return NextResponse.json({ error: 'BUYER_NOT_LINKED' }, { status: 404 });
  if (!seller) return NextResponse.json({ error: 'SELLER_NOT_LINKED' }, { status: 404 });

  const { data: buyerBalance } = await supabase
    .schema('nyang')
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', buyer.discord_user_id)
    .maybeSingle();

  if ((buyerBalance?.balance ?? 0) < totalCost) {
    return NextResponse.json({ error: 'INSUFFICIENT_POINTS' }, { status: 400 });
  }

  // Deduct from buyer, add to seller
  await Promise.all([
    supabase.schema('nyang').from('point_events').insert({
      discord_user_id: buyer.discord_user_id,
      amount: -totalCost,
      kind: `minecraft_p2p_buy:${listing.id}`,
    }),
    supabase.schema('nyang').from('point_events').insert({
      discord_user_id: seller.discord_user_id,
      amount: totalCost,
      kind: `minecraft_p2p_sell:${listing.id}`,
    }),
  ]);

  await supabase
    .schema('nyang')
    .from('mc_p2p_listings')
    .update({ status: 'sold', buyer_uuid: body.uuid, updated_at: new Date().toISOString() })
    .eq('id', listing.id);

  return NextResponse.json({ success: true, totalCost, symbol: listing.symbol, qty: listing.qty });
}
