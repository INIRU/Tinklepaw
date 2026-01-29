import { NextResponse } from 'next/server';
import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'auto';

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
    paidAvailableAt
  });
}
