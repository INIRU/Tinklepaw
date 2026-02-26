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

  const body = await req.json().catch(() => null) as { uuid?: string; minecraftName?: string } | null;
  if (!body?.uuid || !body?.minecraftName) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error } = await supabase
    .schema('nyang')
    .from('minecraft_link_requests')
    .upsert({ minecraft_uuid: body.uuid, minecraft_name: body.minecraftName, otp, expires_at: expiresAt });

  if (error) {
    console.error('[minecraft/link/request] upsert error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }

  return NextResponse.json({ otp, expiresAt });
}
