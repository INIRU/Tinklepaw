import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as { uuid?: string; job?: string } | null;
  if (!body?.uuid || !body?.job) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  if (!['miner', 'farmer'].includes(body.job)) {
    return NextResponse.json({ error: 'INVALID_JOB' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const [{ data: player }, { data: currentJob }] = await Promise.all([
    supabase.schema('nyang').from('minecraft_players').select('discord_user_id').eq('minecraft_uuid', body.uuid).maybeSingle(),
    supabase.schema('nyang').from('minecraft_jobs').select('job').eq('minecraft_uuid', body.uuid).maybeSingle(),
  ]);

  if (!player) return NextResponse.json({ error: 'PLAYER_NOT_LINKED' }, { status: 404 });

  // Initial job selection — free, no level/xp reset
  if (!currentJob) {
    await supabase.schema('nyang').from('minecraft_jobs').upsert(
      { minecraft_uuid: body.uuid, job: body.job as 'miner' | 'farmer', level: 1, xp: 0, updated_at: new Date().toISOString() },
      { onConflict: 'minecraft_uuid' }
    );
    return NextResponse.json({ success: true, job: body.job, cost: 0, initial: true });
  }

  if (currentJob.job === body.job) return NextResponse.json({ error: 'SAME_JOB' }, { status: 400 });

  // Job change — costs points and resets level/xp
  const { data: cfg } = await supabase.schema('nyang').from('app_config').select('mc_job_change_cost_points').eq('id', 1).maybeSingle();
  const changeCost = (cfg as Record<string, unknown> | null)?.mc_job_change_cost_points as number ?? 200;

  const { data: balance } = await supabase
    .schema('nyang')
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', player.discord_user_id)
    .maybeSingle();

  if ((balance?.balance ?? 0) < changeCost) {
    return NextResponse.json({ error: 'INSUFFICIENT_POINTS', cost: changeCost }, { status: 400 });
  }

  await supabase.schema('nyang').from('point_events').insert({
    discord_user_id: player.discord_user_id,
    amount: -changeCost,
    kind: `minecraft_job_change:${body.job}`,
  });

  await supabase
    .schema('nyang')
    .from('minecraft_jobs')
    .update({ job: body.job as 'miner' | 'farmer', level: 1, xp: 0, last_job_change: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('minecraft_uuid', body.uuid);

  return NextResponse.json({ success: true, job: body.job, cost: changeCost });
}
