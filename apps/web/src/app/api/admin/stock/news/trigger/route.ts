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

export async function POST() {
  try {
    const ctx = await requireAdminApi();
    if (isResponse(ctx)) return ctx;

    await getOrInitAppConfig();

    const queuedAt = new Date().toISOString();
    const supabase = createSupabaseAdminClient() as unknown as DynamicSupabase;
    const { error } = await supabase
      .from('app_config')
      .update({ stock_news_force_run_at: queuedAt })
      .eq('id', 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, queuedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to queue stock news generation';
    console.error('[AdminStockNewsTrigger] POST failed:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
