import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { searchGuildMembers } from '@/lib/server/discord';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 20;

  if (q.length < 2) return NextResponse.json({ members: [] });

  try {
    const members = await searchGuildMembers({ query: q, limit });
    return NextResponse.json({ members });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Discord API failed';
    console.error('[AdminDiscordMemberSearch] GET failed:', e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
