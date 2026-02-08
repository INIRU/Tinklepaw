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
    const message = error instanceof Error ? error.message : 'Guild check failed';
    return NextResponse.json({ error: message, code: 'DISCORD_API_ERROR' }, { status: 503 });
  }

  if (!member) {
    return NextResponse.json({ error: 'Not in guild', code: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('enhance_sword', {
    p_discord_user_id: userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'Enhancement failed' }, { status: 500 });
  }

  if (!row.out_success) {
    return NextResponse.json(
      {
        error: row.out_error_code ?? 'Enhancement failed',
        code: row.out_error_code,
        level: row.out_new_level,
        cost: row.out_cost,
        balance: row.out_new_balance,
        sellPrice: row.out_sell_price,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    result: row.out_result,
    previousLevel: row.out_previous_level,
    level: row.out_new_level,
    cost: row.out_cost,
    successRatePct: row.out_success_rate_pct,
    sellPrice: row.out_sell_price,
    balance: row.out_new_balance,
    enhanceAttempts: row.out_enhance_attempts,
    successCount: row.out_success_count,
  });
}
