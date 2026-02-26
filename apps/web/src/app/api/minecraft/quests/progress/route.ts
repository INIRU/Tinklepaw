import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const body = await req.json().catch(() => null) as {
    uuid?: string;
    questId?: string;
    increment?: number;
  } | null;

  if (!body?.uuid || !body?.questId) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const increment = Math.max(1, Math.trunc(body.increment ?? 1));
  const supabase = createSupabaseAdminClient();

  const { data: quest } = await supabase
    .schema('nyang')
    .from('mc_daily_quests')
    .select('id, progress, completed, mc_quest_templates(target_qty)')
    .eq('minecraft_uuid', body.uuid)
    .eq('quest_id', body.questId)
    .eq('quest_date', today)
    .maybeSingle();

  if (!quest || quest.completed) {
    return NextResponse.json({ alreadyCompleted: quest?.completed ?? false });
  }

  const template = quest.mc_quest_templates as unknown as { target_qty: number } | null;
  const targetQty = template?.target_qty ?? 1;
  const newProgress = Math.min(quest.progress + increment, targetQty);
  const completed = newProgress >= targetQty;

  await supabase
    .schema('nyang')
    .from('mc_daily_quests')
    .update({ progress: newProgress, completed })
    .eq('id', quest.id);

  return NextResponse.json({ progress: newProgress, completed });
}
