import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as { userId: string; amount: number; reason?: string };
  const supabase = createSupabaseAdminClient();

  const amt = Number(body.amount);
  if (!body.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
    return NextResponse.json({ error: 'amount must be an integer' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('admin_adjust_points', {
    p_discord_user_id: body.userId,
    p_amount: amt,
    p_reason: body.reason ?? ''
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const newBal = Array.isArray(data) ? data[0] : data;
  if (typeof newBal !== 'number') {
    return NextResponse.json({ error: 'Unexpected rpc result' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, balance: newBal });
}
