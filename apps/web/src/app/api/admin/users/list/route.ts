import { NextResponse } from 'next/server';

import { fetchMemberUserSummary } from '@/lib/server/discord';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 500) : 200;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('discord_user_id, created_at, last_seen_at')
    .order('last_seen_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Admin Users List] Fetch error:', error);
    return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
  }

  const rows = data ?? [];
  if (rows.length === 0) return NextResponse.json({ users: [] });

  const batchSize = 10;
  const enriched = [] as Array<{
    discord_user_id: string;
    created_at: string | null;
    last_seen_at: string | null;
    username: string;
    avatar_url: string | null;
  }>;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const profile = await fetchMemberUserSummary(row.discord_user_id);
          if (!profile?.name) return null;
          return {
            ...row,
            username: profile.name,
            avatar_url: profile.avatarUrl ?? null
          };
        } catch {
          return null;
        }
      })
    );
    for (const row of results) {
      if (row) enriched.push(row);
    }
  }

  return NextResponse.json({ users: enriched });
}
