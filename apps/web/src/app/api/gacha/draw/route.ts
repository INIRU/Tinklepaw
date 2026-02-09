import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { fetchGuildMember, fetchRoleIconMap } from '@/lib/server/discord';

export const runtime = 'nodejs';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const member = await fetchGuildMember({ userId });
  if (!member) {
    return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { poolId?: string; amount?: number } | null;
  const amount = Math.max(1, Math.min(10, body?.amount ?? 1)); // 1~10

  const supabase = createSupabaseAdminClient();
  const results = [];
  let partialError: string | null = null;

  try {
    for (let i = 0; i < amount; i++) {
      let retry = 0;
      let completedCurrentDraw = false;

      while (!completedCurrentDraw) {
        const { data, error } = await supabase.rpc('perform_gacha_draw', {
          p_discord_user_id: userId,
          p_pool_id: body?.poolId ?? null
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

          partialError = `${i + 1}회차 실패: ${errorMsg}`;
          completedCurrentDraw = true;
          break;
        }

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
        
        const row = (Array.isArray(data) ? data[0] : data) as unknown as GachaDrawResult | null;
        if (!row) {
          partialError = `${i + 1}회차 실패: EMPTY_RESULT`;
          completedCurrentDraw = true;
          break;
        }

        results.push({
          itemId: row.out_item_id,
          name: row.out_name,
          rarity: row.out_rarity,
          discordRoleId: row.out_discord_role_id,
          rewardPoints: row.out_reward_points ?? row.reward_points ?? 0,
          isVariant: Boolean(row.out_is_variant)
        });
        completedCurrentDraw = true;
      }

      if (partialError) break;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to draw';
    console.error('[GachaDraw] POST failed:', error);
    return NextResponse.json({ error: msg }, { status: 400 });
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
