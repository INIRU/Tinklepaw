import { NextResponse } from 'next/server';

import { getServerEnv } from '@/lib/server/env';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const admin = await requireAdminApi();
  if (isResponse(admin)) return admin;

  const userId = admin.session.user.id;

  const env = getServerEnv();
  const url = `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${userId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    cache: 'no-store',
  });

  const text = await res.text().catch(() => '');
  const snippet = text.length > 240 ? `${text.slice(0, 240)}…` : text;

  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      guildId: env.NYARU_GUILD_ID,
      userId,
      responseLength: text.length,
      responseSnippet: snippet,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
