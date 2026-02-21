import 'server-only';

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

import { auth } from '../../../auth';
import type { Session } from 'next-auth';

import type { DiscordGuildMember } from './discord';
import { fetchGuildMember, isAdmin } from './discord';
import { getOrInitAppConfig } from './app-config-admin';
import { isAdminModeEnabled } from './admin-mode';

type SessionWithUserId = Session & { user: NonNullable<Session['user']> & { id: string } };

export type AdminContext = {
  session: SessionWithUserId;
  member: DiscordGuildMember;
};

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

function normalizeMaintenancePathTargets(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  const normalized = input
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('/') ? item : `/${item}`))
    .map((item) => (item === '/' ? item : item.replace(/\/+$/, '')))
    .slice(0, 128);
  return Array.from(new Set(normalized));
}

function matchesMaintenancePath(pathname: string, target: string) {
  const evaluate = (current: string) => {
    if (target === '/') return current === '/';

    if (target.endsWith('*')) {
      const prefix = target.slice(0, -1);
      if (!prefix) return false;
      return current.startsWith(prefix);
    }

    return current === target || current.startsWith(`${target}/`);
  };

  if (!target) return false;
  if (evaluate(pathname)) return true;

  if (pathname.startsWith('/api/') && !target.startsWith('/api/')) {
    const mapped = pathname.replace(/^\/api/, '') || '/';
    if (evaluate(mapped)) return true;
  }

  return false;
}

export async function requireAdminApi(): Promise<AdminContext | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const adminModeEnabled = await isAdminModeEnabled();

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
    if (!adminModeEnabled) return NextResponse.json({ error: 'ADMIN_MODE_OFF' }, { status: 403 });
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
  if (!adminModeEnabled) return NextResponse.json({ error: 'ADMIN_MODE_OFF' }, { status: 403 });

  return { session: session as SessionWithUserId, member };
}

export async function requireGuildMemberApi(): Promise<AdminContext | NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const adminModeEnabled = await isAdminModeEnabled();

  try {
    const member = await fetchGuildMember({ userId });
    if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

    try {
      const cfg = await getOrInitAppConfig();
      const cfgRow = cfg as unknown as Record<string, unknown>;
      const maintenanceEnabled = Boolean(cfgRow.maintenance_mode_enabled ?? false);
      if (maintenanceEnabled) {
        const maintenanceTargets = normalizeMaintenancePathTargets(cfgRow.maintenance_web_target_paths);
        const reqHeaders = await headers();
        const pathname = reqHeaders.get('x-pathname');
        const inScope = maintenanceTargets.length === 0
          ? true
          : (pathname ? maintenanceTargets.some((target) => matchesMaintenancePath(pathname, target)) : false);

        if (!inScope) {
          return { session: session as SessionWithUserId, member };
        }

        const maintenanceReason =
          typeof cfgRow.maintenance_mode_reason === 'string' ? cfgRow.maintenance_mode_reason : null;
        const maintenanceUntil =
          typeof cfgRow.maintenance_mode_until === 'string' ? cfgRow.maintenance_mode_until : null;
        const bypass = adminModeEnabled && (Boolean(session.isAdmin) || (await isAdmin({ userId, member })));
        if (!bypass) {
          return NextResponse.json(
            {
              error: 'MAINTENANCE_MODE',
              reason: maintenanceReason,
              until: maintenanceUntil,
            },
            { status: 503 },
          );
        }
      }
    } catch (e) {
      console.error('[requireGuildMemberApi] maintenance check failed:', e);
    }

    return { session: session as SessionWithUserId, member };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    console.error('[requireGuildMemberApi] Discord API error:', msg);
    return NextResponse.json({ error: 'DISCORD_API_ERROR' }, { status: 503 });
  }
}
