import { NextResponse } from 'next/server';

import { fetchGuildMember } from '@/lib/server/discord';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const [{ data: bal }, { data: eq }, { data: inv }, member] = await Promise.all([
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
      .order('updated_at', { ascending: false }),
    fetchGuildMember({ userId }).catch(() => null)
  ]);

  return NextResponse.json({
    userId,
    balance: bal?.balance ?? 0,
    equipped: eq ?? null,
    inventory: inv ?? [],
    memberRoleIds: member?.roles ?? []
  });
}
