import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

type ControlPayload = {
  action: 'play' | 'pause' | 'stop' | 'skip' | 'previous' | 'reorder' | 'add';
  payload?: { order?: string[]; query?: string };
};

export async function POST(request: Request) {
  const ctx = await requireGuildMemberApi();
  if (isResponse(ctx)) return ctx;

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();

  const body = (await request.json().catch(() => null)) as ControlPayload | null;
  if (!body?.action) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });

  const payload = body.payload ?? {};
  const requestedBy = ctx.session.user.id;

  const { data: job, error } = await supabase
    .from('music_control_jobs')
    .insert({
      guild_id: env.NYARU_GUILD_ID,
      action: body.action,
      payload,
      status: 'pending',
      requested_by: requestedBy
    })
    .select('job_id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('music_control_logs').insert({
    guild_id: env.NYARU_GUILD_ID,
    action: body.action,
    status: 'requested',
    message: 'queued from web',
    payload,
    requested_by: requestedBy
  });

  return NextResponse.json({ ok: true, job_id: job?.job_id ?? null });
}
