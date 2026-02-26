import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .schema('nyang')
    .from('mc_market_items')
    .select('symbol, display_name, category, base_price, min_price, max_price, mc_material, enabled, mc_market_prices(current_price, change_pct, updated_at)')
    .order('category')
    .order('symbol');

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => null) as {
    symbol?: string;
    enabled?: boolean;
    base_price?: number;
    min_price?: number;
    max_price?: number;
  } | null;

  if (!body?.symbol) return NextResponse.json({ error: 'MISSING_SYMBOL' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.enabled !== undefined) update.enabled = body.enabled;
  if (body.base_price !== undefined) update.base_price = body.base_price;
  if (body.min_price !== undefined) update.min_price = body.min_price;
  if (body.max_price !== undefined) update.max_price = body.max_price;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .schema('nyang')
    .from('mc_market_items')
    .update(update)
    .eq('symbol', body.symbol);

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
