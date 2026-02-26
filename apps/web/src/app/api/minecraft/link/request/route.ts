import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

function generateOtp(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
}

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { discordId?: string; uuid?: string; minecraftName?: string } | null;
  if (!body?.discordId || !body?.uuid || !body?.minecraftName) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: user } = await supabase
    .schema('nyang')
    .from('users')
    .select('discord_user_id')
    .eq('discord_user_id', body.discordId)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error } = await supabase
    .schema('nyang')
    .from('minecraft_link_requests')
    .upsert({ discord_user_id: body.discordId, otp, expires_at: expiresAt, minecraft_uuid: body.uuid, minecraft_name: body.minecraftName });

  if (error) {
    console.error('[minecraft/link/request] upsert error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ otp, expiresAt });
}
