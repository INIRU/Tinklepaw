import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const env = getServerEnv();
  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/channels`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 60 }
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Discord API failed: ${res.status}` }, { status: 502 });
  }
  const channels = (await res.json()) as Array<{ id: string; name: string; type: number }>; 
  // 0=text, 5=announcement
  const filtered = channels
    .filter((c) => c.type === 0 || c.type === 5)
    .map((c) => ({ id: c.id, name: c.name, type: c.type }));
  return NextResponse.json({ channels: filtered });
}
