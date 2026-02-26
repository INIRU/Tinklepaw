import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .schema('nyang')
    .from('mc_quest_templates')
    .select('id, job_type, description, target_type, target_material, target_qty, reward_points')
    .order('job_type', { nullsFirst: true })
    .order('id');

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ quests: data ?? [] });
}

export async function PATCH(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = await req.json().catch(() => null) as {
    id?: string;
    reward_points?: number;
    target_qty?: number;
  } | null;

  if (!body?.id) return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.reward_points !== undefined) update.reward_points = body.reward_points;
  if (body.target_qty !== undefined) update.target_qty = body.target_qty;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .schema('nyang')
    .from('mc_quest_templates')
    .update(update)
    .eq('id', body.id);

  if (error) return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
