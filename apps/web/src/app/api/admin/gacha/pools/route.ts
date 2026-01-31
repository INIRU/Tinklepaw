import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'auto';

export async function GET() {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('gacha_pools')
      .select(
        'pool_id, name, kind, is_active, banner_image_url, cost_points, paid_pull_cooldown_seconds, free_pull_interval_seconds, rate_r, rate_s, rate_ss, rate_sss, pity_threshold, pity_rarity, start_at, end_at'
      )
      .order('updated_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ pools: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load pools';
    console.error('[AdminGachaPools] GET failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;
    const body = (await req.json()) as {
      pool_id?: string;
      name: string;
      kind?: 'permanent' | 'limited';
      is_active: boolean;
      banner_image_url?: string | null;
      cost_points: number;
      paid_pull_cooldown_seconds: number;
      free_pull_interval_seconds: number | null;
      rate_r?: number;
      rate_s?: number;
      rate_ss?: number;
      rate_sss?: number;
      pity_threshold: number | null;
      pity_rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
      start_at?: string | null;
      end_at?: string | null;
    };

    const supabase = createSupabaseAdminClient();

    const base = {
      name: body.name,
      kind: body.kind ?? 'permanent',
      is_active: body.is_active,
      banner_image_url: body.banner_image_url ?? null,
      cost_points: body.cost_points,
      paid_pull_cooldown_seconds: body.paid_pull_cooldown_seconds,
      free_pull_interval_seconds: body.free_pull_interval_seconds,
      rate_r: body.rate_r ?? 5,
      rate_s: body.rate_s ?? 75,
      rate_ss: body.rate_ss ?? 17,
      rate_sss: body.rate_sss ?? 3,
      pity_threshold: body.pity_threshold,
      pity_rarity: body.pity_rarity,
      start_at: body.start_at ?? null,
      end_at: body.end_at ?? null
    };

    const q = body.pool_id
      ? supabase.from('gacha_pools').upsert({ pool_id: body.pool_id, ...base })
      : supabase.from('gacha_pools').insert(base);

    const { data, error } = await q
      .select(
        'pool_id, name, kind, is_active, banner_image_url, cost_points, paid_pull_cooldown_seconds, free_pull_interval_seconds, rate_r, rate_s, rate_ss, rate_sss, pity_threshold, pity_rarity, start_at, end_at'
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ pool: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to save pool';
    console.error('[AdminGachaPools] POST failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;
    
    const { searchParams } = new URL(req.url);
    const poolId = searchParams.get('poolId');
    if (!poolId) return NextResponse.json({ error: 'poolId required' }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('gacha_pools').delete().eq('pool_id', poolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to delete pool';
    console.error('[AdminGachaPools] DELETE failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
