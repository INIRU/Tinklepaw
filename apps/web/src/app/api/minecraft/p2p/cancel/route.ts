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
    .select('id, seller_uuid, status')
    .eq('id', body.listingId)
    .maybeSingle();

  if (!listing) return NextResponse.json({ error: 'LISTING_NOT_FOUND' }, { status: 404 });
  if (listing.seller_uuid !== body.uuid) return NextResponse.json({ error: 'NOT_OWNER' }, { status: 403 });
  if (listing.status !== 'open') return NextResponse.json({ error: 'LISTING_NOT_OPEN' }, { status: 400 });

  await supabase
    .schema('nyang')
    .from('mc_p2p_listings')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', listing.id);

  return NextResponse.json({ success: true });
}
