import { NextResponse } from 'next/server';

import { isResponse, requireGuildMemberApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

const CONTROL_ACTIONS = new Set([
  'play',
  'pause',
  'stop',
  'skip',
  'previous',
  'reorder',
  'add',
  'remove',
  'clear'
] as const);
const JOB_ACK_TIMEOUT_MS = 12000;
const JOB_POLL_INTERVAL_MS = 180;

type ControlPayload = {
  action: 'play' | 'pause' | 'stop' | 'skip' | 'previous' | 'reorder' | 'add' | 'remove' | 'clear';
  payload?: {
    order?: string[];
    query?: string;
    trackId?: string;
    index?: number;
    requester?: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      source: 'web';
    };
  };
};

const userAvatarUrl = (id: string, avatar: string | null | undefined) => {
  if (!avatar) return null;
  const ext = avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=64`;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const validatePayload = (action: ControlPayload['action'], payload: unknown): string | null => {
  if (!isObject(payload)) {
    return ['add', 'reorder', 'remove'].includes(action) ? 'INVALID_PAYLOAD' : null;
  }

  if (action === 'add') {
    return typeof payload.query === 'string' && payload.query.trim().length > 0 ? null : 'INVALID_QUERY';
  }

  if (action === 'reorder') {
    if (!Array.isArray(payload.order) || payload.order.length === 0) return 'INVALID_ORDER';
    return payload.order.every((item) => typeof item === 'string' && item.length > 0) ? null : 'INVALID_ORDER';
  }

  if (action === 'remove') {
    if (typeof payload.trackId === 'string' && payload.trackId.length > 0) return null;
    if (typeof payload.index === 'number' && Number.isInteger(payload.index)) return null;
    return 'INVALID_REMOVE_TARGET';
  }

  return null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForJobResult = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  jobId: string,
  timeoutMs = JOB_ACK_TIMEOUT_MS,
) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from('music_control_jobs')
      .select('status, error_message')
      .eq('job_id', jobId)
      .maybeSingle();

    if (error) {
      return { state: 'lookup_error' as const, error: error.message };
    }

    if (!data) {
      return { state: 'missing' as const };
    }

    if (data.status === 'succeeded') {
      return { state: 'succeeded' as const };
    }

    if (data.status === 'failed') {
      return { state: 'failed' as const, error: data.error_message ?? '요청 처리에 실패했습니다.' };
    }

    await sleep(JOB_POLL_INTERVAL_MS);
  }

  return { state: 'timeout' as const };
};

export async function POST(request: Request) {
  const ctx = await requireGuildMemberApi();
  if (isResponse(ctx)) return ctx;

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();

  const body = (await request.json().catch(() => null)) as ControlPayload | null;
  if (!body?.action || !CONTROL_ACTIONS.has(body.action)) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 });
  }

  const payload = body.payload ?? {};
  const payloadError = validatePayload(body.action, payload);
  if (payloadError) {
    return NextResponse.json({ error: payloadError }, { status: 400 });
  }
  const requestedBy = ctx.session.user.id;
  const requesterUsername = ctx.member.user?.username ?? ctx.session.user.name ?? 'web';
  const requesterDisplayName = ctx.member.nick ?? ctx.member.user?.global_name ?? requesterUsername;
  const requesterAvatarUrl = userAvatarUrl(requestedBy, ctx.member.user?.avatar ?? null);
  const normalizedPayload = body.action === 'add'
    ? {
        ...payload,
        requester: {
          id: requestedBy,
          username: requesterUsername,
          displayName: requesterDisplayName,
          avatarUrl: requesterAvatarUrl,
          source: 'web' as const
        }
      }
    : payload;

  const { data: job, error } = await supabase
    .from('music_control_jobs')
    .insert({
        guild_id: env.NYARU_GUILD_ID,
        action: body.action,
        payload: normalizedPayload,
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
    payload: normalizedPayload,
    requested_by: requestedBy
  });

  const jobId = job?.job_id ?? null;
  if (!jobId) {
    return NextResponse.json({ error: 'JOB_ID_MISSING' }, { status: 500 });
  }

  const ack = await waitForJobResult(supabase, jobId);

  if (ack.state === 'succeeded') {
    return NextResponse.json({ ok: true, job_id: jobId, status: 'succeeded' });
  }

  if (ack.state === 'failed') {
    return NextResponse.json(
      {
        ok: false,
        job_id: jobId,
        status: 'failed',
        error: ack.error,
      },
      { status: 409 },
    );
  }

  if (ack.state === 'lookup_error') {
    return NextResponse.json(
      {
        ok: false,
        job_id: jobId,
        status: 'lookup_error',
        error: 'ACK_LOOKUP_FAILED',
      },
      { status: 500 },
    );
  }

  const pendingError = ack.state === 'missing' ? 'JOB_NOT_FOUND' : 'BOT_ACK_TIMEOUT';
  return NextResponse.json(
    {
      ok: false,
      pending: true,
      job_id: jobId,
      status: 'pending',
      error: pendingError,
    },
    { status: 202 },
  );
}
