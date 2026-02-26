import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';

export const runtime = 'nodejs';

const MC_FIELDS = [
  'mc_market_fee_bps',
  'mc_market_event_interval_ms',
  'mc_market_channel_id',
  'mc_job_change_cost_points',
  'mc_freshness_decay_minutes',
  'mc_purity_y_bonus_enabled',
] as const;

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const cfg = await getOrInitAppConfig();
  const mc = Object.fromEntries(MC_FIELDS.map((k) => [k, cfg[k]]));
  return NextResponse.json(mc);
}

export async function PUT(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => null) as Partial<Record<typeof MC_FIELDS[number], unknown>> | null;
  if (!body) return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });

  const update: Record<string, unknown> = {};
  for (const k of MC_FIELDS) {
    if (k in body) update[k] = body[k];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'NO_FIELDS' }, { status: 400 });

  const cfg = await getOrInitAppConfig();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .schema('nyang')
    .from('app_config')
    .update(update)
    .eq('id', cfg.id);

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
