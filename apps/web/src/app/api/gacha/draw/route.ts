import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember, fetchRoleIconMap } from '@/lib/server/discord';

export const runtime = 'nodejs';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAW_REQUEST_LOCK_TTL_MS = 20_000;
const inFlightDrawRequests = new Map<string, number>();

const isRetryableDrawError = (message: string) => {
  const m = message.toUpperCase();
  return (
    m.includes('PAID_COOLDOWN') ||
    m.includes('DEADLOCK') ||
    m.includes('SERIALIZ') ||
    m.includes('LOCK TIMEOUT') ||
    m.includes('STATEMENT TIMEOUT') ||
    m.includes('TIMEOUT')
  );
};

const retryDelayMs = (message: string, retry: number) => {
  const m = message.toUpperCase();
  if (m.includes('PAID_COOLDOWN')) {
    return Math.min(1600, 280 + retry * 140);
  }
  return Math.min(900, 120 + retry * 90);
};

const normalizeDrawAmount = (rawAmount: unknown) => {
  const parsed = Number(rawAmount);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
};

const isKnownClientDrawError = (message: string) => {
  const m = message.toUpperCase();
  return m.includes('INSUFFICIENT_POINTS') || m.includes('NO_ACTIVE_POOL');
};

const shouldFallbackToLegacyDrawLoop = (message: string) => {
  const m = message.toUpperCase();
  return m.includes('PERFORM_GACHA_DRAW_BATCH') && (m.includes('FUNCTION') || m.includes('DOES NOT EXIST'));
};

type GachaDrawResult = {
  item_id?: string;
  out_item_id?: string;
  name?: string;
  out_name?: string;
  rarity?: 'R' | 'S' | 'SS' | 'SSS';
  out_rarity?: 'R' | 'S' | 'SS' | 'SSS';
  discord_role_id?: string | null;
  out_discord_role_id?: string | null;
  reward_points?: number;
  out_reward_points?: number;
  out_is_variant?: boolean;
};

const normalizeDrawRow = (row: GachaDrawResult | null) => {
  if (!row) return null;
  return {
    itemId: row.out_item_id ?? row.item_id,
    name: row.out_name ?? row.name,
    rarity: row.out_rarity ?? row.rarity,
    discordRoleId: row.out_discord_role_id ?? row.discord_role_id ?? null,
    rewardPoints: row.out_reward_points ?? row.reward_points ?? 0,
    isVariant: Boolean(row.out_is_variant),
  };
};

export async function POST(req: Request) {
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
    console.error(`[GachaDraw] guild check failed [${requestId}]`, error);
    return NextResponse.json({ error: 'Service unavailable', code: 'DISCORD_API_ERROR', requestId }, { status: 503 });
  }

  if (!member) {
    return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { poolId?: string; amount?: number } | null;
  const poolId = typeof body?.poolId === 'string' && body.poolId.trim() ? body.poolId.trim() : null;
  if (poolId && !UUID_RE.test(poolId)) {
    return NextResponse.json({ error: 'POOL_ID_INVALID' }, { status: 400 });
  }

  const amount = normalizeDrawAmount(body?.amount);

  const now = Date.now();
  const existingLockAt = inFlightDrawRequests.get(userId);
  if (existingLockAt && now - existingLockAt < DRAW_REQUEST_LOCK_TTL_MS) {
    return NextResponse.json({ error: 'DRAW_IN_PROGRESS' }, { status: 429 });
  }
  const lockToken = now;
  inFlightDrawRequests.set(userId, lockToken);

  const results: Array<{
    itemId?: string;
    name?: string;
    rarity?: 'R' | 'S' | 'SS' | 'SSS';
    discordRoleId?: string | null;
    rewardPoints: number;
    isVariant: boolean;
  }> = [];
  let partialError: string | null = null;

  try {
    const supabase = createSupabaseAdminClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as <T>(
      fn: string,
      args?: Record<string, unknown>
    ) => Promise<{ data: T[] | T | null; error: { message: string; code?: string } | null }>;

    let shouldRunLegacyLoop = amount <= 1;

    if (!shouldRunLegacyLoop) {
      const { data, error } = await rpc<GachaDrawResult>('perform_gacha_draw_batch', {
        p_discord_user_id: userId,
        p_pool_id: poolId,
        p_amount: amount,
      });

      if (error) {
        const errorMsg = (error.message || error.code || 'UNKNOWN_DRAW_ERROR').trim();
        if (!shouldFallbackToLegacyDrawLoop(errorMsg)) {
          throw error;
        }
        shouldRunLegacyLoop = true;
      } else {
        const rows = (Array.isArray(data) ? data : data ? [data] : []) as GachaDrawResult[];
        for (const row of rows) {
          const normalized = normalizeDrawRow(row);
          if (!normalized) continue;
          results.push(normalized);
        }
        if (results.length < amount) {
          partialError = `${results.length + 1}회차 중단: DRAW_STOPPED`;
        }
      }
    }

    if (shouldRunLegacyLoop) {
      for (let i = 0; i < amount; i++) {
        let retry = 0;
        let completedCurrentDraw = false;

        while (!completedCurrentDraw) {
          const { data, error } = await rpc<GachaDrawResult>('perform_gacha_draw', {
            p_discord_user_id: userId,
            p_pool_id: poolId
          });

          if (error) {
            const errorMsg = (error.message || error.code || 'UNKNOWN_DRAW_ERROR').trim();

            if (errorMsg.includes('INSUFFICIENT_POINTS') || errorMsg.includes('NO_ACTIVE_POOL')) {
              throw error;
            }

            if (isRetryableDrawError(errorMsg) && retry < 10) {
              retry += 1;
              await sleep(retryDelayMs(errorMsg, retry));
              continue;
            }

            partialError = `${i + 1}회차 실패: TEMPORARY_DRAW_ERROR`;
            completedCurrentDraw = true;
            break;
          }

          const row = (Array.isArray(data) ? data[0] : data) as unknown as GachaDrawResult | null;
          const normalized = normalizeDrawRow(row);
          if (!normalized) {
            partialError = `${i + 1}회차 실패: DRAW_RESULT_MISSING`;
            completedCurrentDraw = true;
            break;
          }

          results.push(normalized);
          completedCurrentDraw = true;
        }

        if (partialError) break;
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to draw';
    if (isKnownClientDrawError(msg)) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const requestId = crypto.randomUUID();
    console.error(`[GachaDraw] POST failed [${requestId}]`, error);
    return NextResponse.json({ error: 'DRAW_FAILED', code: 'INTERNAL_DRAW_ERROR', requestId }, { status: 500 });
  } finally {
    if (inFlightDrawRequests.get(userId) === lockToken) {
      inFlightDrawRequests.delete(userId);
    }
  }

  if (results.length === 0) {
    return NextResponse.json({ error: 'No result' }, { status: 500 });
  }

  const roleIds = [...new Set(results.map((r) => r.discordRoleId).filter(Boolean))] as string[];
  const roleIconMap = await fetchRoleIconMap(roleIds);
  const resultsWithIcons = results.map((r) => ({
    ...r,
    roleIconUrl: r.discordRoleId ? roleIconMap.get(r.discordRoleId) ?? null : null
  }));

  return NextResponse.json({
    results: resultsWithIcons,
    requestedAmount: amount,
    completedAmount: resultsWithIcons.length,
    partial: resultsWithIcons.length < amount,
    warning: partialError,
  });
}
