import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '../../../../lib/server/discord';
import { createSupabaseAdminClient } from '../../../../lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
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
    console.error(`[ForgeStatus] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) {
    return NextResponse.json({ error: 'Not in guild', code: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('get_sword_forge_status', {
    p_discord_user_id: userId,
  });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[ForgeStatus] rpc failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Failed to load forge status', code: 'FORGE_STATUS_RPC_FAILED', requestId }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return NextResponse.json({ error: 'Failed to load forge status' }, { status: 500 });
  }

  return NextResponse.json({
    level: row.out_level,
    enhanceCost: row.out_enhance_cost,
    sellPrice: row.out_sell_price,
    successRatePct: row.out_success_rate_pct,
    balance: row.out_balance,
    tunaEnergy: row.out_tuna_forge_energy,
    enhanceAttempts: row.out_enhance_attempts,
    successCount: row.out_success_count,
    soldCount: row.out_sold_count,
  });
}
