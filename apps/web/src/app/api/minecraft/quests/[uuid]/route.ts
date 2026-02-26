import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireMinecraftApiKey, isResponse } from '@/lib/server/guards-api';

export const runtime = 'nodejs';

const QUESTS_PER_DAY = 3;

export async function GET(req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  const guard = await requireMinecraftApiKey(req);
  if (isResponse(guard)) return guard;

  const { uuid } = await params;
  const today = new Date().toISOString().slice(0, 10);
  const supabase = createSupabaseAdminClient();

  // Get or create today's quests
  let { data: quests } = await supabase
    .schema('nyang')
    .from('mc_daily_quests')
    .select('*, mc_quest_templates(*)')
    .eq('minecraft_uuid', uuid)
    .eq('quest_date', today);

  if (!quests || quests.length === 0) {
    // Get player job to assign relevant quests
    const { data: job } = await supabase
      .schema('nyang')
      .from('minecraft_jobs')
      .select('job')
      .eq('minecraft_uuid', uuid)
      .maybeSingle();

    const jobType = job?.job ?? 'miner';

    // Fetch templates relevant to this player's job
    const { data: templates } = await supabase
      .schema('nyang')
      .from('mc_quest_templates')
      .select('id')
      .or(`job_type.is.null,job_type.eq.${jobType}`);

    if (templates && templates.length > 0) {
      const shuffled = templates.sort(() => Math.random() - 0.5).slice(0, QUESTS_PER_DAY);
      await supabase.schema('nyang').from('mc_daily_quests').insert(
        shuffled.map((t) => ({
          minecraft_uuid: uuid,
          quest_id: t.id,
          quest_date: today,
        }))
      );
      const { data: newQuests } = await supabase
        .schema('nyang')
        .from('mc_daily_quests')
        .select('*, mc_quest_templates(*)')
        .eq('minecraft_uuid', uuid)
        .eq('quest_date', today);
      quests = newQuests;
    }
  }

  return NextResponse.json({ quests: quests ?? [] });
}
