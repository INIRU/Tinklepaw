import 'server-only';

import { NextResponse } from 'next/server';

import { auth } from '../../../auth';
import type { Session } from 'next-auth';

import type { DiscordGuildMember } from './discord';
import { fetchGuildMember, isAdmin } from './discord';

type SessionWithUserId = Session & { user: NonNullable<Session['user']> & { id: string } };

export type AdminContext = {
  session: SessionWithUserId;
  member: DiscordGuildMember;
};

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

export async function requireAdminApi(): Promise<AdminContext | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  // Check cached admin status from session first (refreshed every 5 min in JWT callback)
  if (session.isAdmin === true) {
    // Trust the session's isAdmin flag - fetch member data for AdminContext
    let member: DiscordGuildMember | null = null;
    try {
      member = await fetchGuildMember({ userId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Discord API error';
      console.error('[requireAdminApi] Discord API error (cached admin):', msg);
      return NextResponse.json({ error: 'SERVICE_UNAVAILABLE', detail: 'Please try again later' }, { status: 503 });
    }
    if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
    return { session: session as SessionWithUserId, member };
  }

  // Fallback: session.isAdmin not set or false - do full check
  let member: DiscordGuildMember | null = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Discord API error';
    console.error('[requireAdminApi] Discord API error:', msg);
    return NextResponse.json({ error: 'SERVICE_UNAVAILABLE', detail: 'Please try again later' }, { status: 503 });
  }
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const ok = await isAdmin({ userId, member });
  if (!ok) return NextResponse.json({ error: 'NOT_ADMIN' }, { status: 403 });

  return { session: session as SessionWithUserId, member };
}

export async function requireGuildMemberApi(): Promise<AdminContext | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  try {
    const member = await fetchGuildMember({ userId });
    if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
    return { session, member };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    console.error('[requireGuildMemberApi] Discord API error:', msg);
    return NextResponse.json({ error: 'DISCORD_API_ERROR' }, { status: 503 });
  }
}
