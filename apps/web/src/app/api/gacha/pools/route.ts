import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember } from '@/lib/server/discord';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let member = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[GachaPools] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('gacha_pools')
    .select('pool_id, name, kind, is_active, banner_image_url, cost_points, free_pull_interval_seconds, paid_pull_cooldown_seconds, pity_threshold, pity_rarity, rate_r, rate_s, rate_ss, rate_sss, start_at, end_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[GachaPools] query failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Failed to load pools', code: 'GACHA_POOLS_QUERY_FAILED', requestId }, { status: 500 });
  }

  const now = Date.now();
  const pools = (data ?? []).filter((p) => {
    const startAt = (p as unknown as { start_at?: string | null }).start_at;
    const endAt = (p as unknown as { end_at?: string | null }).end_at;
    const startOk = !startAt || new Date(startAt).getTime() <= now;
    const endOk = !endAt || new Date(endAt).getTime() > now;
    return startOk && endOk;
  });

  return NextResponse.json({ pools });
}
