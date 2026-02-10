import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let member = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[InventoryUnequip] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('set_equipped_item', {
    p_discord_user_id: userId,
    p_item_id: null
  });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[InventoryUnequip] rpc failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Failed to unequip item', code: 'UNEQUIP_RPC_FAILED', requestId }, { status: 500 });
  }
  return NextResponse.json({ result: Array.isArray(data) ? data[0] : data });
}
