import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol');
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .schema('nyang')
    .from('mc_p2p_listings')
    .select('id, seller_uuid, symbol, qty, price_per_unit, created_at, minecraft_players!seller_uuid(minecraft_name)')
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(50);

  if (symbol) query = query.eq('symbol', symbol);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });

  return NextResponse.json({ listings: data });
}
