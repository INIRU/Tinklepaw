import { NextResponse } from 'next/server';

import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

type DynamicSupabase = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type ForcedSentiment = 'bullish' | 'bearish' | 'neutral';
type ForcedTier = 'general' | 'rare' | 'shock';

const FORCED_SCENARIO_MAX = 120;

const normalizeForcedSentiment = (value: unknown): ForcedSentiment | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (raw === 'bullish' || raw === 'bearish' || raw === 'neutral') return raw;
  return null;
};

const normalizeForcedTier = (value: unknown): ForcedTier | null => {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (raw === 'general' || raw === 'rare' || raw === 'shock') return raw;
  return null;
};

const normalizeForcedScenario = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.slice(0, FORCED_SCENARIO_MAX);
};

export async function POST(request: Request) {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;

    await getOrInitAppConfig();

    const parsedBody = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const hasSentimentInput = Object.prototype.hasOwnProperty.call(parsedBody, 'sentiment');
    const hasTierInput = Object.prototype.hasOwnProperty.call(parsedBody, 'tier');

    const forcedSentiment = normalizeForcedSentiment(parsedBody.sentiment);
    const forcedTier = normalizeForcedTier(parsedBody.tier);
    const forcedScenario = normalizeForcedScenario(parsedBody.scenario);

    if (hasSentimentInput && parsedBody.sentiment != null && forcedSentiment === null) {
      return NextResponse.json({ error: 'Invalid sentiment. Use bullish/bearish/neutral.' }, { status: 400 });
    }

    if (hasTierInput && parsedBody.tier != null && forcedTier === null) {
      return NextResponse.json({ error: 'Invalid tier. Use general/rare/shock.' }, { status: 400 });
    }

    const queuedAt = new Date().toISOString();
    const supabase = createSupabaseAdminClient() as unknown as DynamicSupabase;
    const { error } = await supabase
      .from('app_config')
      .update({
        stock_news_force_run_at: queuedAt,
        stock_news_force_sentiment: forcedSentiment,
        stock_news_force_tier: forcedTier,
        stock_news_force_scenario: forcedScenario
      })
      .eq('id', 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      queuedAt,
      forcedSentiment,
      forcedTier,
      forcedScenario
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to queue stock news generation';
    console.error('[AdminStockNewsTrigger] POST failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
