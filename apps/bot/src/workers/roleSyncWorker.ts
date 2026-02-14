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
const STATUS_SAMPLE_CRON_MINUTE_STEP = 10;
const MONITOR_ALERT_STREAK = 3;
const MONITOR_ALERT_COOLDOWN_MS = 15 * 60 * 1000;
const MONITOR_LOG_INTERVAL_MS = 2 * 60 * 1000;

type SyncStatusOptions = {
  recordSamples: boolean;
  recordMonitoring: boolean;
};

type StatusSample = {
  service: 'bot' | 'lavalink';
  status: 'operational' | 'degraded' | 'down' | 'unknown';
};

type ServiceHealth = StatusSample & {
  message: string;
  latencyMs: number | null;
};

const serviceFailureStreak = new Map<StatusSample['service'], number>();
const serviceLastAlertAt = new Map<StatusSample['service'], number>();
const serviceLastMonitorLogAt = new Map<StatusSample['service'], number>();
const serviceLastObservedStatus = new Map<StatusSample['service'], StatusSample['status']>();

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

const trackFailure = (service: StatusSample['service'], status: StatusSample['status']) => {
  const isFailure = status === 'down' || status === 'degraded' || status === 'unknown';
  if (!isFailure) {
    serviceFailureStreak.set(service, 0);
    return 0;
  }

  const next = (serviceFailureStreak.get(service) ?? 0) + 1;
  serviceFailureStreak.set(service, next);
  return next;
};

const logMonitoringEvent = async (client: Client, health: ServiceHealth, streak: number) => {
  const ctx = getBotContext();
  const now = Date.now();
  const key = health.service;
  const previousStatus = serviceLastObservedStatus.get(key);
  const lastLogAt = serviceLastMonitorLogAt.get(key) ?? 0;
  const shouldLogTransition = previousStatus !== health.status;
  const shouldLogInterval = health.status !== 'operational' && now - lastLogAt >= MONITOR_LOG_INTERVAL_MS;

  if (!shouldLogTransition && !shouldLogInterval) {
    return;
  }

  await ctx.supabase.from('music_control_logs').insert({
    guild_id: ctx.env.NYARU_GUILD_ID,
    action: 'monitor',
    status: health.status,
    message: `${health.service} 상태: ${health.status} (${health.message})`,
    payload: {
      service: health.service,
      status: health.status,
      latency_ms: health.latencyMs,
      streak
    },
    requested_by: null
  });

  serviceLastMonitorLogAt.set(key, now);
  serviceLastObservedStatus.set(key, health.status);

  const shouldAlert = streak >= MONITOR_ALERT_STREAK && health.status !== 'operational';
  if (!shouldAlert) {
    return;
  }

  const lastAlertAt = serviceLastAlertAt.get(key) ?? 0;
  if (now - lastAlertAt < MONITOR_ALERT_COOLDOWN_MS) {
    return;
  }

  const config = await getAppConfig().catch(() => null);
  const channelId = config?.error_log_channel_id;
  if (!channelId) {
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    return;
  }

  await channel.send(
    [
      '⚠️ **Nyaru 모니터링 경고**',
      `서비스: ${health.service}`,
      `상태: ${health.status}`,
      `연속 실패: ${streak}회`,
      `세부: ${health.message}${health.latencyMs !== null ? ` (latency: ${health.latencyMs}ms)` : ''}`
    ].join('\n')
  );
  serviceLastAlertAt.set(key, now);
};

async function syncStatusSamples(
  client: Client,
  options: SyncStatusOptions = { recordSamples: true, recordMonitoring: true }
) {
  const samples: ServiceHealth[] = [{ service: 'bot', status: 'operational', message: 'running', latencyMs: null }];

  try {
    const music = getMusic();
    const nodeStatus = getNodeStatus(music);
    if (nodeStatus.ready) {
      samples.push({ service: 'lavalink', status: 'operational', message: nodeStatus.summary, latencyMs: null });
    } else if (nodeStatus.summary.includes('연결된 Lavalink 노드가 없습니다')) {
      samples.push({ service: 'lavalink', status: 'down', message: nodeStatus.summary, latencyMs: null });
    } else {
      samples.push({ service: 'lavalink', status: 'degraded', message: nodeStatus.summary, latencyMs: null });
    }
  } catch (error) {
    console.warn('[StatusSamples] Failed to read Lavalink status:', error);
    samples.push({ service: 'lavalink', status: 'unknown', message: 'status read failed', latencyMs: null });
  }

  await Promise.all(samples.map(async (sample) => {
    if (options.recordSamples) {
      await recordStatusSample({ service: sample.service, status: sample.status });
    }

    if (!options.recordMonitoring) {
      return;
    }

    const streak = trackFailure(sample.service, sample.status);
    await logMonitoringEvent(client, sample, streak).catch((error) => {
      console.warn('[StatusSamples] Failed to write monitoring event:', error);
    });
  }));
}

const getDelayToNextStatusSampleCron = () => {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);

  const currentMinute = now.getMinutes();
  const nextMinute = Math.floor(currentMinute / STATUS_SAMPLE_CRON_MINUTE_STEP) * STATUS_SAMPLE_CRON_MINUTE_STEP
    + STATUS_SAMPLE_CRON_MINUTE_STEP;

  if (nextMinute >= 60) {
    next.setHours(now.getHours() + 1, 0, 0, 0);
  } else {
    next.setMinutes(nextMinute, 0, 0);
  }

  const delay = next.getTime() - now.getTime();
  return delay > 0 ? delay : STATUS_SAMPLE_INTERVAL_MS;
};

function startStatusSampleCron(client: Client) {
  const scheduleNext = () => {
    setTimeout(() => {
      void syncStatusSamples(client, { recordSamples: true, recordMonitoring: false })
        .catch((error) => {
          console.warn('[StatusSamples] Cron run failed:', error);
        })
        .finally(scheduleNext);
    }, getDelayToNextStatusSampleCron());
  };

  scheduleNext();
}

export function startRoleSyncWorker(client: Client) {
  let isRunning = false;
  startStatusSampleCron(client);

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      
      await syncHeartbeat();
      await syncStatusSamples(client, { recordSamples: false, recordMonitoring: true });

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
