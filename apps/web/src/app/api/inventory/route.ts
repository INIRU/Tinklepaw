import { NextResponse } from 'next/server';

import { auth } from '../../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const supabase = createSupabaseAdminClient();

  const [{ data: bal }, { data: eq }, { data: inv, error: invErr }] = await Promise.all([
    supabase.from('point_balances').select('balance').eq('discord_user_id', userId).maybeSingle(),
    supabase
      .from('equipped')
      .select('item_id, items:items(name, rarity, discord_role_id)')
      .eq('discord_user_id', userId)
      .maybeSingle(),
    supabase
      .from('inventory')
      .select('item_id, qty, items:items(name, rarity, discord_role_id)')
      .eq('discord_user_id', userId)
      .gt('qty', 0)
      .order('updated_at', { ascending: false })
  ]);

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });

  return NextResponse.json({
    balance: bal?.balance ?? 0,
    equipped: eq
      ? {
          itemId: eq.item_id as string | null,
          item: eq.items as unknown
        }
      : null,
    inventory: (inv ?? []).map((row) => ({
      itemId: row.item_id as string,
      qty: row.qty as number,
      item: row.items as unknown
    }))
  });
}
