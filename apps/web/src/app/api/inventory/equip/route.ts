import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let member = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[InventoryEquip] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { itemId?: string } | null;
  if (!body?.itemId) return NextResponse.json({ error: 'ITEM_ID_REQUIRED' }, { status: 400 });
  if (!UUID_RE.test(body.itemId)) return NextResponse.json({ error: 'ITEM_ID_INVALID' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('set_equipped_item', {
    p_discord_user_id: userId,
    p_item_id: body.itemId
  });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[InventoryEquip] rpc failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Failed to equip item', code: 'EQUIP_RPC_FAILED', requestId }, { status: 500 });
  }
  return NextResponse.json({ result: Array.isArray(data) ? data[0] : data });
}
