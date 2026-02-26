import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { discordId?: string; uuid?: string; minecraftName?: string; otp?: string } | null;
  if (!body?.discordId || !body?.uuid || !body?.minecraftName || !body?.otp) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: request } = await supabase
    .schema('nyang')
    .from('minecraft_link_requests')
    .select('otp, expires_at')
    .eq('discord_user_id', body.discordId)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: 'NO_PENDING_REQUEST' }, { status: 404 });
  }
  if (request.otp !== body.otp) {
    return NextResponse.json({ error: 'INVALID_OTP' }, { status: 400 });
  }
  if (new Date(request.expires_at) < new Date()) {
    return NextResponse.json({ error: 'OTP_EXPIRED' }, { status: 400 });
  }

  const { error: insertError } = await supabase
    .schema('nyang')
    .from('minecraft_players')
    .upsert({
      minecraft_uuid: body.uuid,
      discord_user_id: body.discordId,
      minecraft_name: body.minecraftName,
    });

  if (insertError) {
    console.error('[minecraft/link/confirm] insert error:', insertError);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  await supabase
    .schema('nyang')
    .from('minecraft_link_requests')
    .delete()
    .eq('discord_user_id', body.discordId);

  // Init job record
  await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .upsert({ minecraft_uuid: body.uuid, job: 'miner', level: 1, xp: 0 });

  return NextResponse.json({ success: true });
}
