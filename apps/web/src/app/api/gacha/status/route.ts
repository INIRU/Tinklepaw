import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'auto';

const toSafeNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const poolId = searchParams.get('poolId');

  const supabase = createSupabaseAdminClient();

  // Fetch balance
  const { data: balanceData, error: balanceError } = await supabase
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', userId)
    .single();

  if (balanceError && balanceError.code !== 'PGRST116') { // PGRST116: JSON object requested, multiple (or no) rows returned
    return NextResponse.json({ error: balanceError.message }, { status: 500 });
  }

  const balance = balanceData?.balance ?? 0;

  let pityCounter = 0;
  let freeAvailableAt: string | null = null;
  let paidAvailableAt: string | null = null;
  let jackpotPoolPoints = 0;
  let jackpotActivityRatePct = 0;
  let lastJackpotPayout = 0;
  let lastJackpotAt: string | null = null;

  const { data: lotteryConfigData, error: lotteryConfigError } = await supabase
    .from('app_config')
    .select('lottery_jackpot_pool_points, lottery_activity_jackpot_rate_pct')
    .eq('id', 1)
    .maybeSingle();

  if (!lotteryConfigError && lotteryConfigData) {
    jackpotPoolPoints = Math.max(0, Math.floor(toSafeNumber(lotteryConfigData.lottery_jackpot_pool_points)));
    jackpotActivityRatePct = Math.max(0, toSafeNumber(lotteryConfigData.lottery_activity_jackpot_rate_pct));
  }

  const { data: lastJackpotData, error: lastJackpotError } = await supabase
    .from('point_events')
    .select('amount, created_at')
    .eq('kind', 'lottery_ticket_payout')
    .filter('meta->>tier', 'eq', 'jackpot')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastJackpotError && lastJackpotData) {
    lastJackpotPayout = Math.max(0, Math.floor(toSafeNumber(lastJackpotData.amount)));
    lastJackpotAt = lastJackpotData.created_at;
  }

  if (poolId) {
    const { data: stateData } = await supabase
      .from('gacha_user_state')
      .select('pity_counter, free_available_at, paid_available_at')
      .eq('discord_user_id', userId)
      .eq('pool_id', poolId)
      .single();
    
    if (stateData) {
      pityCounter = stateData.pity_counter;
      freeAvailableAt = stateData.free_available_at;
      paidAvailableAt = stateData.paid_available_at;
    }
  }

  return NextResponse.json({
    balance,
    pityCounter,
    freeAvailableAt,
    paidAvailableAt,
    jackpotPoolPoints,
    jackpotActivityRatePct,
    lastJackpotPayout,
    lastJackpotAt,
  });
}
