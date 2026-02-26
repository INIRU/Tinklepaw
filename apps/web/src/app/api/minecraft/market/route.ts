import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .schema('nyang')
    .from('mc_market_items')
    .select('symbol, display_name, category, base_price, min_price, max_price, mc_material, enabled, mc_market_prices(current_price, change_pct, updated_at)')
    .eq('enabled', true);

  if (error) {
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
