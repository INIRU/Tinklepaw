import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember } from '@/lib/server/discord';

export const runtime = 'nodejs';
export const dynamic = 'auto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clampInt = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.trunc(n)));

const parseIntInRange = (raw: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return clampInt(parsed, min, max);
};

const parseRarities = (value: string | null) => {
  if (!value) return [];
  const raw = value
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  const ok = new Set(['R', 'S', 'SS', 'SSS']);
  return raw.filter((x) => ok.has(x)) as Array<'R' | 'S' | 'SS' | 'SSS'>;
};

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let member = null;
  try {
    member = await fetchGuildMember({ userId });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error(`[GachaHistory] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) {
    return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseIntInRange(searchParams.get('limit'), 30, 1, 50);
  const offset = parseIntInRange(searchParams.get('offset'), 0, 0, 100_000);
  const poolId = searchParams.get('poolId');
  if (poolId && !UUID_RE.test(poolId)) {
    return NextResponse.json({ error: 'POOL_ID_INVALID' }, { status: 400 });
  }
  const rarities = parseRarities(searchParams.get('rarities'));
  const pityOnly = searchParams.get('pity') === '1';
  const qRaw = (searchParams.get('q') ?? '').trim().slice(0, 120);
  const q = qRaw.toLowerCase();

  const supabase = createSupabaseAdminClient();

  const entries: Array<{
    pullId: string;
    createdAt: string;
    pool: { poolId: string; name: string | null; kind: 'permanent' | 'limited' | null };
    isFree: boolean;
    spentPoints: number;
    result: {
      itemId: string;
      name: string | null;
      rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
      discordRoleId: string | null;
      rewardPoints: number;
      qty: number;
      isPity: boolean;
      isVariant?: boolean;
    } | null;
  }> = [];

  let fetchOffset = offset;
  const chunk = 50;
  let fetched = 0;

  while (entries.length < limit) {
    const { data, error } = await supabase
      .from('gacha_pulls')
      .select(
        'pull_id, created_at, pool_id, is_free, spent_points, gacha_pools(name, kind), gacha_pull_results(qty, is_pity, is_variant, item_id, items(name, rarity, discord_role_id, reward_points))',
      )
      .eq('discord_user_id', userId)
      .order('created_at', { ascending: false })
      .range(fetchOffset, fetchOffset + chunk - 1);

    if (error) {
      const requestId = crypto.randomUUID();
      console.error(`[GachaHistory] query failed [${requestId}]`, error);
      return NextResponse.json({ error: 'Failed to load history', code: 'GACHA_HISTORY_QUERY_FAILED', requestId }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as Array<{
      pull_id: string;
      created_at: string;
      pool_id: string;
      is_free: boolean;
      spent_points: number;
      gacha_pools: { name: string | null; kind: 'permanent' | 'limited' | null } | null;
      gacha_pull_results:
        | Array<{
            qty: number;
            is_pity: boolean;
            is_variant?: boolean;
            item_id: string;
            items:
              | {
                  name: string | null;
                  rarity: 'R' | 'S' | 'SS' | 'SSS' | null;
                  discord_role_id: string | null;
                  reward_points: number | null;
                }
              | null;
          }>
        | null;
    }>;

    if (rows.length === 0) break;

    fetched += rows.length;
    fetchOffset += rows.length;

    for (const row of rows) {
      if (poolId && row.pool_id !== poolId) continue;
      const r0 = row.gacha_pull_results?.[0] ?? null;
      const item = r0?.items ?? null;
      const rarity = item?.rarity ?? null;
      const name = item?.name ?? null;

      if (rarities.length > 0 && (!rarity || !rarities.includes(rarity))) continue;
      if (pityOnly && !r0?.is_pity) continue;
      if (q && !(name ?? '').toLowerCase().includes(q)) continue;

      entries.push({
        pullId: row.pull_id,
        createdAt: row.created_at,
        pool: {
          poolId: row.pool_id,
          name: row.gacha_pools?.name ?? null,
          kind: row.gacha_pools?.kind ?? null,
        },
        isFree: row.is_free,
        spentPoints: row.spent_points,
        result: r0
          ? {
              itemId: r0.item_id,
              name,
              rarity,
              discordRoleId: item?.discord_role_id ?? null,
              rewardPoints: item?.reward_points ?? 0,
              qty: r0.qty,
          isPity: r0.is_pity,
          isVariant: Boolean(r0.is_variant),
        }
      : null,
  });

      if (entries.length >= limit) break;
    }

    if (rows.length < chunk) break;
    if (fetched >= 500) break;
  }

  return NextResponse.json({
    entries,
    nextOffset: fetchOffset,
    exhausted: entries.length < limit,
  });
}
