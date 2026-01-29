import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'auto';

export async function GET(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const poolId = searchParams.get('poolId');

  if (!poolId) {
    return NextResponse.json({ error: 'poolId required' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('gacha_pool_items')
    .select('item_id')
    .eq('pool_id', poolId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ itemIds: data?.map((d) => d.item_id) ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = (await req.json().catch(() => null)) as {
    poolId: string;
    itemId: string;
    action: 'add' | 'remove';
  } | null;

  if (!body?.poolId || !body?.itemId || !body?.action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (body.action === 'add') {
    const { error } = await supabase
      .from('gacha_pool_items')
      .upsert({ pool_id: body.poolId, item_id: body.itemId, weight: 1 }, { onConflict: 'pool_id, item_id', ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from('gacha_pool_items')
      .delete()
      .eq('pool_id', body.poolId)
      .eq('item_id', body.itemId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
