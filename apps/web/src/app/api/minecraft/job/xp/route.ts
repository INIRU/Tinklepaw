import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

function xpRequiredForLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.6));
}

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string; xp?: number } | null;
  if (!body?.uuid || !body?.xp || body.xp <= 0) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .select('level, xp')
    .eq('minecraft_uuid', body.uuid)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: 'JOB_NOT_FOUND' }, { status: 404 });

  let { level, xp } = job;
  xp += body.xp;
  let leveledUp = false;

  while (xp >= xpRequiredForLevel(level)) {
    xp -= xpRequiredForLevel(level);
    level++;
    leveledUp = true;
  }

  await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .update({ level, xp, updated_at: new Date().toISOString() })
    .eq('minecraft_uuid', body.uuid);

  return NextResponse.json({ level, xp, leveledUp, xpToNextLevel: xpRequiredForLevel(level) });
}
