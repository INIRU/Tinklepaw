import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/server/env';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

type Body = {
  userId?: unknown;
  roleId?: unknown;
  op?: unknown;
};

export async function POST(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const body = (await req.json().catch(() => null)) as Body | null;
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const roleId = typeof body?.roleId === 'string' ? body.roleId.trim() : '';
  const op = body?.op === 'add' || body?.op === 'remove' ? body.op : null;

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (!roleId) return NextResponse.json({ error: 'roleId required' }, { status: 400 });
  if (!op) return NextResponse.json({ error: 'op must be add or remove' }, { status: 400 });

  const env = getServerEnv();
  if (roleId === env.NYARU_GUILD_ID) {
    return NextResponse.json({ error: '@everyone role cannot be modified' }, { status: 400 });
  }

  const roleEndpoint = `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${userId}/roles/${roleId}`;
  const updateRes = await fetch(roleEndpoint, {
    method: op === 'add' ? 'PUT' : 'DELETE',
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  if (!updateRes.ok) {
    const text = await updateRes.text().catch(() => '');
    const snippet = text.length > 220 ? `${text.slice(0, 220)}...` : text;
    return NextResponse.json(
      { error: `Discord API failed (${updateRes.status})${snippet ? ` ${snippet}` : ''}` },
      { status: 502 }
    );
  }

  const memberRes = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${userId}`, {
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
    },
    cache: 'no-store'
  });

  if (!memberRes.ok) {
    return NextResponse.json({ ok: true, memberRoleIds: [] });
  }

  const member = (await memberRes.json().catch(() => null)) as { roles?: unknown } | null;
  const memberRoleIds = Array.isArray(member?.roles)
    ? member.roles.filter((v): v is string => typeof v === 'string')
    : [];

  return NextResponse.json({ ok: true, memberRoleIds });
}
