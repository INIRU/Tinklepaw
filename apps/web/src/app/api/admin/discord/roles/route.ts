import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';
export const dynamic = 'auto';

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;
  const env = getServerEnv();
  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 60 }
  });
  if (!res.ok) {
    return NextResponse.json({ error: `Discord API failed: ${res.status}` }, { status: 502 });
  }
  const roles = (await res.json()) as Array<{ id: string; name: string; position: number; managed: boolean }>; 
  const filtered = roles
    .filter((r) => !r.managed && r.id !== env.NYARU_GUILD_ID)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, position: r.position }));
  return NextResponse.json({ roles: filtered });
}
