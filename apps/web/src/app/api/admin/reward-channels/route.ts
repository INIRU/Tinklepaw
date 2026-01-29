import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('reward_channels')
    .select('channel_id, enabled')
    .order('channel_id', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as { channelId: string; enabled?: boolean };
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('reward_channels')
    .upsert({ channel_id: body.channelId, enabled: body.enabled ?? true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const body = (await req.json()) as { enabledChannelIds?: unknown };
  const ids = Array.isArray(body.enabledChannelIds) ? body.enabledChannelIds : [];
  const enabledChannelIds = Array.from(
    new Set(ids.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x.length > 0))
  );

  const supabase = createSupabaseAdminClient();

  const del = await supabase.from('reward_channels').delete().filter('channel_id', 'neq', '');
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  if (enabledChannelIds.length > 0) {
    const ins = await supabase
      .from('reward_channels')
      .insert(enabledChannelIds.map((channel_id) => ({ channel_id, enabled: true })));
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, enabledChannelIds });
}

export async function DELETE(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const channelId = url.searchParams.get('channelId');
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('reward_channels').delete().eq('channel_id', channelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
