import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { getMusic, getNodeStatus } from '../services/music.js';

type RoleSyncJob = {
  job_id: string;
  discord_user_id: string;
  add_role_id: string | null;
  remove_role_id: string | null;
  attempts: number;
};

async function processJob(client: Client, job: RoleSyncJob) {
  const ctx = getBotContext();
  const guild = await client.guilds.fetch(ctx.env.NYARU_GUILD_ID);
  const me = guild.members.me ?? (await guild.members.fetchMe());
  const botHighest = me.roles.highest;

  const member = await guild.members.fetch(job.discord_user_id);

  const removeId = job.remove_role_id;
  if (removeId) {
    const role = guild.roles.cache.get(removeId) ?? (await guild.roles.fetch(removeId));
    if (!role) throw new Error(`Role not found: ${removeId}`);
    if (role.position >= botHighest.position) throw new Error(`Role hierarchy prevents removing: ${role.name}`);
    if (member.roles.cache.has(removeId)) {
      await member.roles.remove(removeId, `Nyaru role sync job ${job.job_id}`);
    }
  }

  const addId = job.add_role_id;
  if (addId) {
    const role = guild.roles.cache.get(addId) ?? (await guild.roles.fetch(addId));
    if (!role) throw new Error(`Role not found: ${addId}`);
    if (role.position >= botHighest.position) throw new Error(`Role hierarchy prevents adding: ${role.name}`);
    if (!member.roles.cache.has(addId)) {
      await member.roles.add(addId, `Nyaru role sync job ${job.job_id}`);
    }
  }
}

async function syncHeartbeat() {
  try {
    const ctx = getBotContext();
    await ctx.supabase
      .from('app_config')
      .update({ last_heartbeat_at: new Date().toISOString() } as Record<string, unknown>)
      .eq('id', 1);
  } catch (e) {
    console.warn('[Worker] Failed to update heartbeat:', e);
  }
}

const STATUS_SAMPLE_INTERVAL_MS = 10 * 60 * 1000;

type StatusSample = {
  service: 'bot' | 'lavalink';
  status: 'operational' | 'degraded' | 'down' | 'unknown';
};

async function recordStatusSample(sample: StatusSample) {
  const ctx = getBotContext();
  try {
    const { data: last, error: lastError } = await ctx.supabase
      .from('status_samples')
      .select('created_at')
      .eq('service', sample.service)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) {
      console.error('[StatusSamples] Failed to load last sample:', sample.service, lastError);
      return;
    }

    if (last?.created_at) {
      const lastAt = new Date(last.created_at).getTime();
      if (Date.now() - lastAt < STATUS_SAMPLE_INTERVAL_MS) return;
    }

    const { error: insertError } = await ctx.supabase.from('status_samples').insert({
      service: sample.service,
      status: sample.status
    });

    if (insertError) {
      console.error('[StatusSamples] Failed to insert sample:', sample, insertError);
    }
  } catch (e) {
    console.error('[StatusSamples] Unexpected error while recording sample:', sample, e);
  }
}

async function syncStatusSamples() {
  const samples: StatusSample[] = [{ service: 'bot', status: 'operational' }];

  try {
    const music = getMusic();
    const nodeStatus = getNodeStatus(music);
    if (nodeStatus.ready) {
      samples.push({ service: 'lavalink', status: 'operational' });
    } else if (nodeStatus.summary.includes('연결된 Lavalink 노드가 없습니다')) {
      samples.push({ service: 'lavalink', status: 'down' });
    } else {
      samples.push({ service: 'lavalink', status: 'degraded' });
    }
  } catch (error) {
    console.warn('[StatusSamples] Failed to read Lavalink status:', error);
    samples.push({ service: 'lavalink', status: 'unknown' });
  }

  await Promise.all(samples.map(recordStatusSample));
}

export function startRoleSyncWorker(client: Client) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      
      await syncHeartbeat();
      await syncStatusSamples();

      const { data: jobs, error } = await ctx.supabase
        .from('role_sync_jobs')
        .select('job_id, discord_user_id, add_role_id, remove_role_id, attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (error || !jobs || jobs.length === 0) return;

      for (const job of jobs as RoleSyncJob[]) {
        // Mark running + increment attempts
        await ctx.supabase
          .from('role_sync_jobs')
          .update({ status: 'running', attempts: job.attempts + 1, updated_at: new Date().toISOString() })
          .eq('job_id', job.job_id)
          .eq('status', 'pending');

        try {
          await processJob(client, job);
          await ctx.supabase
            .from('role_sync_jobs')
            .update({ status: 'succeeded', updated_at: new Date().toISOString(), last_error: null })
            .eq('job_id', job.job_id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          console.error('[RoleSync] Job failed:', { jobId: job.job_id, userId: job.discord_user_id, error: msg });
          await ctx.supabase
            .from('role_sync_jobs')
            .update({ status: 'failed', updated_at: new Date().toISOString(), last_error: msg })
            .eq('job_id', job.job_id);
        }
      }
    } finally {
      isRunning = false;
      const config = await getAppConfig().catch(() => ({ bot_sync_interval_ms: 5000 }));
      setTimeout(() => {
        void tick();
      }, config.bot_sync_interval_ms || 5000);
    }
  };

  void tick();
}
