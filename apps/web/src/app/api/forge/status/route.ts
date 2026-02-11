import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '../../../../lib/server/discord';
import { createSupabaseAdminClient } from '../../../../lib/server/supabase-admin';

export const runtime = 'nodejs';

const toSafeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

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

  const level = Math.max(0, Math.floor(toSafeNumber(row.out_level)));
  const enhanceCost = Math.max(0, Math.floor(toSafeNumber(row.out_enhance_cost)));
  const sellPrice = Math.max(0, Math.floor(toSafeNumber(row.out_sell_price)));
  const totalPaidCost = Math.max(0, Math.floor(toSafeNumber(row.out_total_paid_cost)));
  const sellProfit = sellPrice - totalPaidCost;

  return NextResponse.json({
    level,
    enhanceCost,
    sellPrice,
    totalPaidCost,
    sellProfit,
    successRatePct: toSafeNumber(row.out_success_rate_pct),
    balance: Math.floor(toSafeNumber(row.out_balance)),
    tunaEnergy: Math.max(0, Math.floor(toSafeNumber(row.out_tuna_forge_energy))),
    enhanceAttempts: Math.max(0, Math.floor(toSafeNumber(row.out_enhance_attempts))),
    successCount: Math.max(0, Math.floor(toSafeNumber(row.out_success_count))),
    soldCount: Math.max(0, Math.floor(toSafeNumber(row.out_sold_count))),
  });
}
