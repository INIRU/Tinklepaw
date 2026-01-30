import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember } from '@/lib/server/discord';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const member = await fetchGuildMember({ userId });
  if (!member) {
    return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { poolId?: string; amount?: number } | null;
  const amount = Math.max(1, Math.min(10, body?.amount ?? 1)); // 1~10

  const supabase = createSupabaseAdminClient();
  const results = [];

  try {
    // Process sequentially to prevent Deadlocks/Race conditions
    for (let i = 0; i < amount; i++) {
      const { data, error } = await supabase.rpc('perform_gacha_draw', {
        p_discord_user_id: userId,
        p_pool_id: body?.poolId ?? null
      });

      if (error) {
        // If it's the first pull and it fails, return error immediately
        if (i === 0) {
          throw error;
        }
        // If partial success, stop here and return what we have (or could throw error)
        // For now, let's stop and return partial results
        break;
      }

      type GachaDrawResult = {
        item_id?: string;
        out_item_id?: string;
        name?: string;
        out_name?: string;
        rarity?: 'R' | 'S' | 'SS' | 'SSS';
        out_rarity?: 'R' | 'S' | 'SS' | 'SSS';
        discord_role_id?: string | null;
        out_discord_role_id?: string | null;
      };
      
      const row = (Array.isArray(data) ? data[0] : data) as unknown as GachaDrawResult | null;
      if (row) {
        results.push({
          itemId: row.out_item_id,
          name: row.out_name,
          rarity: row.out_rarity,
          discordRoleId: row.out_discord_role_id
        });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to draw';
    console.error('[GachaDraw] POST failed:', error);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'No result' }, { status: 500 });
  }

  return NextResponse.json({ results });
}
