import type { Client } from 'discord.js';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';

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

export function startRoleSyncWorker(client: Client) {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      
      await syncHeartbeat();

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
