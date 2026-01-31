import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember, fetchRoleIconMap } from '@/lib/server/discord';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const url = new URL(req.url);
  const poolId = url.searchParams.get('poolId');
  if (!poolId) return NextResponse.json({ error: 'POOL_ID_REQUIRED' }, { status: 400 });

  const supabase = createSupabaseAdminClient();

  type PoolRow = {
    pool_id: string;
    is_active: boolean;
    start_at: string | null;
    end_at: string | null;
  };

  const { data: poolRaw, error: poolErr } = await supabase
    .from('gacha_pools')
    .select('pool_id, is_active, start_at, end_at')
    .eq('pool_id', poolId)
    .maybeSingle();

  if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 400 });
  const pool = poolRaw as unknown as PoolRow | null;
  if (!pool || !pool.is_active) {
    return NextResponse.json({ error: 'POOL_NOT_ACTIVE' }, { status: 400 });
  }
  const now = Date.now();
  const startAt = pool.start_at;
  const endAt = pool.end_at;
  if (startAt && new Date(startAt).getTime() > now) {
    return NextResponse.json({ error: 'POOL_NOT_STARTED' }, { status: 400 });
  }
  if (endAt && new Date(endAt).getTime() <= now) {
    return NextResponse.json({ error: 'POOL_ENDED' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('gacha_pool_items')
    .select('item_id, items(item_id, name, rarity, discord_role_id, reward_points)')
    .eq('pool_id', poolId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rawItems = (data ?? [])
    .map((row) => {
      const item = Array.isArray(row.items) ? row.items[0] : row.items;
      if (!item) return null;
      return {
        itemId: item.item_id,
        name: item.name,
        rarity: item.rarity,
        discordRoleId: item.discord_role_id,
        rewardPoints: item.reward_points ?? 0
      };
    })
    .filter(Boolean) as Array<{
      itemId: string;
      name: string;
      rarity: 'R' | 'S' | 'SS' | 'SSS';
      discordRoleId: string | null;
      rewardPoints: number;
    }>;

  const roleIds = [...new Set(rawItems.map((i) => i.discordRoleId).filter(Boolean))] as string[];
  const roleIconMap = await fetchRoleIconMap(roleIds);
  const items = rawItems.map((item) => ({
    ...item,
    roleIconUrl: item.discordRoleId ? roleIconMap.get(item.discordRoleId) ?? null : null
  }));

  return NextResponse.json({ items });
}
