import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { searchGuildMembers, fetchGuildMember, type DiscordMemberSearchResult } from '@/lib/server/discord';

export const runtime = 'nodejs';

function userAvatarUrl(user: { id: string; avatar?: string | null }): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

export async function GET(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(req.url);

  // Batch lookup by IDs: ?ids=123,456
  const idsParam = url.searchParams.get('ids');
  if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const results = await Promise.all(
      ids.map(async (id): Promise<DiscordMemberSearchResult> => {
        try {
          const member = await fetchGuildMember({ userId: id });
          if (!member?.user) return { id, username: id, globalName: null, nick: null, avatarUrl: null };
          return {
            id: member.user.id,
            username: member.user.username,
            globalName: member.user.global_name ?? null,
            nick: member.nick ?? null,
            avatarUrl: userAvatarUrl(member.user),
          };
        } catch {
          return { id, username: id, globalName: null, nick: null, avatarUrl: null };
        }
      }),
    );
    return NextResponse.json({ members: results });
  }

  // Name search: ?q=keyword
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
