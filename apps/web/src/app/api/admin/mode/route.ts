import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember, isAdmin } from '@/lib/server/discord';
import { ADMIN_MODE_COOKIE } from '@/lib/server/admin-mode';

export const runtime = 'nodejs';

type Body = {
  enabled?: unknown;
};

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let member = null as Awaited<ReturnType<typeof fetchGuildMember>>;
  try {
    member = await fetchGuildMember({ userId });
  } catch {
    return NextResponse.json({ error: 'DISCORD_API_ERROR' }, { status: 503 });
  }
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const ok = await isAdmin({ userId, member });
  if (!ok) return NextResponse.json({ error: 'NOT_ADMIN' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (typeof body?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, enabled: body.enabled });
  res.cookies.set({
    name: ADMIN_MODE_COOKIE,
    value: body.enabled ? 'on' : 'off',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
