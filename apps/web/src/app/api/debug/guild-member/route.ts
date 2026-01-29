import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const env = getServerEnv();
  const url = `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${userId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` }
  });

  const text = await res.text().catch(() => '');
  const snippet = text.length > 800 ? `${text.slice(0, 800)}…` : text;

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    guildId: env.NYARU_GUILD_ID,
    userId,
    responseSnippet: snippet
  });
}
