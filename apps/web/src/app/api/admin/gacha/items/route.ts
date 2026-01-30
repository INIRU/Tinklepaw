import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'auto';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('items')
    .select('item_id, name, rarity, discord_role_id, is_active, duplicate_refund_points, reward_points')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as {
    item_id?: string;
    name: string;
    rarity: 'R' | 'S' | 'SS' | 'SSS';
    discord_role_id: string | null;
    is_active: boolean;
    duplicate_refund_points: number;
    reward_points?: number;
  };

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('items')
    .upsert({
      item_id: body.item_id,
      name: body.name,
      rarity: body.rarity,
      discord_role_id: body.discord_role_id,
      is_active: body.is_active,
      duplicate_refund_points: body.duplicate_refund_points,
      reward_points: body.reward_points ?? 0
    })
    .select('item_id, name, rarity, discord_role_id, is_active, duplicate_refund_points, reward_points')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('items').delete().eq('item_id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
