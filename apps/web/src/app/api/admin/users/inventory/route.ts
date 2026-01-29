import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as { userId: string; itemId: string; qty: number };
  const supabase = createSupabaseAdminClient();
  await supabase.rpc('ensure_user', { p_discord_user_id: body.userId });

  const { error } = await supabase
    .from('inventory')
    .upsert({ discord_user_id: body.userId, item_id: body.itemId, qty: body.qty, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
