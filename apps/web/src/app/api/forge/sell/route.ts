import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '../../../../lib/server/discord';
import { createSupabaseAdminClient } from '../../../../lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let member = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[ForgeSell] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) {
    return NextResponse.json({ error: 'Not in guild', code: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('sell_sword', {
    p_discord_user_id: userId,
  });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[ForgeSell] rpc failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Sell failed', code: 'FORGE_SELL_RPC_FAILED', requestId }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'Sell failed' }, { status: 500 });
  }

  if (!row.out_success) {
    return NextResponse.json(
      {
        error: row.out_error_code ?? 'Sell failed',
        code: row.out_error_code,
        level: row.out_reset_level,
        balance: row.out_new_balance,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    soldLevel: row.out_sold_level,
    payout: row.out_payout,
    balance: row.out_new_balance,
    level: row.out_reset_level,
    nextEnhanceCost: row.out_next_enhance_cost,
    sellCount: row.out_sell_count,
  });
}
