import type { Json } from '@nyaru/core';
import type { KazagumoPlayer } from 'kazagumo';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { clearMusicState, getMusic, updateMusicSetupMessage, updateMusicState } from '../services/music.js';

type MusicControlJob = {
  job_id: string;
  guild_id: string;
  action: string;
  payload: Json | null;
  requested_by: string | null;
};

const logAction = async (job: MusicControlJob, status: string, message: string | null) => {
  const ctx = getBotContext();
  await ctx.supabase.from('music_control_logs').insert({
    guild_id: job.guild_id,
    action: job.action,
    status,
    message,
    payload: job.payload ?? {},
    requested_by: job.requested_by
  });
};

const reorderQueue = (player: KazagumoPlayer, order: string[]) => {
  if (!player || !Array.isArray(order) || order.length === 0) return;
  const current = player.queue.slice(0);
  const byId = new Map(current.map((track) => [track.track, track]));
  const next = order.map((id) => byId.get(id)).filter((track): track is typeof current[number] => !!track);
  const remaining = current.filter((track) => !order.includes(track.track));
  player.queue.clear();
  player.queue.add([...next, ...remaining]);
};

const handleJob = async (job: MusicControlJob) => {
  const music = getMusic();
  const player = music.players.get(job.guild_id);
  if (!player) {
    if (job.action === 'stop') {
      await clearMusicState(job.guild_id).catch(() => {});
      await logAction(job, 'success', 'No active player for guild (state cleared)');
      return;
    }

    await logAction(job, 'failed', 'No active player for guild');
    return;
  }

  switch (job.action) {
    case 'play':
      if (player.paused) player.pause(false);
      else await player.play();
      await logAction(job, 'success', 'Playback started');
      break;
    case 'pause':
      player.pause(true);
      await logAction(job, 'success', 'Playback paused');
      break;
    case 'stop':
      player.destroy();
      updateMusicSetupMessage(player, null).catch(() => {});
      clearMusicState(job.guild_id).catch(() => {});
      await logAction(job, 'success', 'Playback stopped');
      break;
    case 'skip':
      player.skip();
      await logAction(job, 'success', 'Skipped to next track');
      break;
    case 'previous': {
      const previous = player.getPrevious(true);
      if (!previous) {
        await logAction(job, 'failed', 'No previous track');
        break;
      }
      await player.play(previous);
      await logAction(job, 'success', 'Moved to previous track');
      break;
    }
    case 'reorder': {
      const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? (job.payload as { order?: Json }) : null;
      const orderRaw = payload?.order;
      const order = Array.isArray(orderRaw) ? orderRaw.filter((id): id is string => typeof id === 'string') : [];
      reorderQueue(player, order);
      await updateMusicSetupMessage(player, player.queue.current ?? null).catch(() => {});
      await updateMusicState(player).catch(() => {});
      await logAction(job, 'success', 'Queue reordered');
      break;
    }
    case 'add': {
      const payload = job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) ? (job.payload as { query?: Json }) : null;
      const query = typeof payload?.query === 'string' ? payload?.query.trim() : '';
      if (!query) {
        await logAction(job, 'failed', 'Missing query');
        break;
      }

      const searchResult = await music.search(query, {
        requester: { id: job.requested_by ?? 'web', username: 'web' }
      });

      if (!searchResult.tracks.length) {
        await logAction(job, 'failed', 'No search results');
        break;
      }

      if (searchResult.type === 'PLAYLIST') {
        player.queue.add(searchResult.tracks);
        await logAction(job, 'success', `Added playlist (${searchResult.tracks.length} tracks)`);
      } else {
        const track = searchResult.tracks[0];
        player.queue.add(track);
        await logAction(job, 'success', `Added track: ${track.title}`);
      }

      if (!player.playing && !player.paused) {
        await player.play();
      }

      await updateMusicSetupMessage(player, player.queue.current ?? null).catch(() => {});
      await updateMusicState(player).catch(() => {});
      break;
    }
    default:
      await logAction(job, 'failed', `Unknown action: ${job.action}`);
  }
};

export function startMusicControlWorker() {
  let isRunning = false;

  const tick = async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const ctx = getBotContext();
      const { data: jobs } = await ctx.supabase
        .from('music_control_jobs')
        .select('job_id, guild_id, action, payload, requested_by')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);

      if (!jobs?.length) return;

      for (const job of jobs as MusicControlJob[]) {
        const claimAt = new Date().toISOString();
        const { data: claimed, error: claimError } = await ctx.supabase
          .from('music_control_jobs')
          .update({ status: 'running', updated_at: claimAt })
          .eq('job_id', job.job_id)
          .eq('status', 'pending')
          .select('job_id');

        if (claimError || !claimed?.length) continue;

        try {
          await handleJob(job);
          await ctx.supabase
            .from('music_control_jobs')
            .update({ status: 'succeeded', updated_at: new Date().toISOString(), error_message: null })
            .eq('job_id', job.job_id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          await ctx.supabase
            .from('music_control_jobs')
            .update({ status: 'failed', updated_at: new Date().toISOString(), error_message: msg })
            .eq('job_id', job.job_id);
          await logAction(job, 'failed', msg);
        } finally {
          await ctx.supabase.from('music_control_jobs').delete().eq('job_id', job.job_id);
        }
      }
    } finally {
      isRunning = false;
      const config = await getAppConfig().catch(() => ({ bot_sync_interval_ms: 4000 }));
      setTimeout(() => {
        void tick();
      }, config.bot_sync_interval_ms || 4000);
    }
  };

  void tick();
}
