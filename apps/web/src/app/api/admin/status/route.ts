import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('status_samples')
    .select('service, status, created_at')
    .in('service', ['bot', 'lavalink'])
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const bot = (data ?? []).filter((sample) => sample.service === 'bot').reverse();
  const lavalink = (data ?? []).filter((sample) => sample.service === 'lavalink').reverse();

  return NextResponse.json({ bot, lavalink });
}
