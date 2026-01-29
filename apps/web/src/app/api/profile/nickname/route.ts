import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const body = (await req.json()) as { nickname: string };
  const nickname = (body.nickname ?? '').trim();
  if (nickname.length < 2 || nickname.length > 32) {
    return NextResponse.json({ error: 'Nickname must be 2-32 characters.' }, { status: 400 });
  }

  const env = getServerEnv();
  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${userId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ nick: nickname })
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json({ error: `Discord API failed (${res.status}) ${text}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
