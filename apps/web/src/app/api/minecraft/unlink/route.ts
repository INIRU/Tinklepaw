import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string } | null;
  if (!body?.uuid) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Check player exists
  const { data: player } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .select('discord_user_id')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!player) {
    return NextResponse.json({ error: 'NOT_LINKED' }, { status: 404 });
  }

  // Delete player record and job record
  await Promise.all([
    supabase.schema('nyang').from('minecraft_players').delete().eq('minecraft_uuid', body.uuid),
    supabase.schema('nyang').from('minecraft_jobs').delete().eq('minecraft_uuid', body.uuid),
  ]);

  return NextResponse.json({ success: true });
}
