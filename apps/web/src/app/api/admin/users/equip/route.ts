import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as { userId: string; itemId: string | null };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('set_equipped_item', {
    p_discord_user_id: body.userId,
    p_item_id: body.itemId
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: Array.isArray(data) ? data[0] : data });
}
