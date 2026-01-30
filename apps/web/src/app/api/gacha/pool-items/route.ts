import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember } from '@/lib/server/discord';

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
  const { data, error } = await supabase
    .from('gacha_pool_items')
    .select('item_id, items(item_id, name, rarity, discord_role_id, reward_points)')
    .eq('pool_id', poolId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data ?? [])
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
    .filter(Boolean);

  return NextResponse.json({ items });
}
