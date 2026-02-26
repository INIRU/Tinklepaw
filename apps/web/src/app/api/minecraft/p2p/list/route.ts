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
    pricePerUnit?: number;
  } | null;

  if (!body?.uuid || !body?.symbol || !body?.qty || !body?.pricePerUnit) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }
  if (body.qty <= 0 || body.pricePerUnit <= 0) {
    return NextResponse.json({ error: 'INVALID_VALUES' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .schema('nyang')
    .from('mc_p2p_listings')
    .insert({
      seller_uuid: body.uuid,
      symbol: body.symbol,
      qty: body.qty,
      price_per_unit: body.pricePerUnit,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[p2p/list] insert error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
