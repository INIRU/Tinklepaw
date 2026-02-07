import type { Json } from '@nyaru/core';
import type { KazagumoPlayer } from 'kazagumo';

import { getBotContext } from '../context.js';
import { getAppConfig } from '../services/config.js';
import { isSpotifyQuery, searchTracksWithFallback } from '../services/musicSearch.js';
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

const failJob = (message: string): never => {
  throw new Error(message);
};

const ensureInteger = (value: number | null, message: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(message);
  }
  return value;
};

const ensurePresent = <T>(value: T | null, message: string): T => {
  if (value === null) {
    throw new Error(message);
  }
  return value;
};

const asPayloadObject = (payload: Json | null): Record<string, Json> | null => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, Json>;
};

const asRequesterFromPayload = (payload: Json | null, fallbackId: string | null) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      id: fallbackId ?? 'web',
      username: 'web',
      displayName: null as string | null,
      avatarUrl: null as string | null,
      source: 'web'
    };
  }

  const value = payload as Record<string, Json>;
  const id = typeof value.id === 'string' ? value.id : (fallbackId ?? 'web');
  const username = typeof value.username === 'string' ? value.username : 'web';
  const displayName = typeof value.displayName === 'string' ? value.displayName : null;
  const avatarUrl = typeof value.avatarUrl === 'string' ? value.avatarUrl : null;
  const source = typeof value.source === 'string' ? value.source : 'web';

  return { id, username, displayName, avatarUrl, source };
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

const removeQueueTrack = (player: KazagumoPlayer, index: number) => {
  const queue = player.queue.slice(0);
  if (index < 0 || index >= queue.length) return null;
  const [removed] = queue.splice(index, 1);
  player.queue.clear();
  player.queue.add(queue);
  return removed ?? null;
};

const handleJob = async (job: MusicControlJob) => {
  const music = getMusic();
  const player = music.players.get(job.guild_id);
  if (!player) {
    throw new Error('현재 재생 중인 음악이 없습니다.');
  }
  const activePlayer = player;

  switch (job.action) {
    case 'play':
      if (activePlayer.playing && !activePlayer.paused) {
        failJob('이미 재생 중입니다.');
      }
      if (!activePlayer.paused && !activePlayer.queue.current && activePlayer.queue.size < 1) {
        failJob('재생할 곡이 없습니다.');
      }
      if (activePlayer.paused) {
        activePlayer.pause(false);
      } else {
        await activePlayer.play();
      }
      await logAction(job, 'success', '재생을 시작했어요.');
      break;
    case 'pause':
      if (!activePlayer.playing || activePlayer.paused) {
        failJob('이미 일시정지 상태입니다.');
      }
      activePlayer.pause(true);
      await logAction(job, 'success', '일시정지했어요.');
      break;
    case 'stop':
      if (!activePlayer.queue.current && !activePlayer.playing && !activePlayer.paused && activePlayer.queue.size < 1) {
        failJob('현재 재생 중인 음악이 없습니다.');
      }
      activePlayer.destroy();
      updateMusicSetupMessage(activePlayer, null).catch(() => {});
      clearMusicState(job.guild_id).catch(() => {});
      await logAction(job, 'success', '재생을 중지했어요.');
      break;
    case 'skip':
      if (!activePlayer.queue.current) {
        failJob('현재 재생 중인 음악이 없습니다.');
      }
      if (activePlayer.queue.size < 1) {
        failJob('다음 곡이 없습니다.');
      }
      activePlayer.skip();
      setTimeout(() => {
        updateMusicState(activePlayer).catch(() => {});
      }, 700);
      await logAction(job, 'success', '다음 곡으로 이동했어요.');
      break;
    case 'previous': {
      const previous = activePlayer.getPrevious(true);
      if (!previous) {
        failJob('이전 곡이 없습니다.');
      }
      await activePlayer.play(previous);
      setTimeout(() => {
        updateMusicState(activePlayer).catch(() => {});
      }, 700);
      await logAction(job, 'success', '이전 곡으로 이동했어요.');
      break;
    }
    case 'reorder': {
      const payload = asPayloadObject(job.payload) as { order?: Json } | null;
      const orderRaw = payload?.order;
      const order = Array.isArray(orderRaw) ? orderRaw.filter((id): id is string => typeof id === 'string') : [];
      if (order.length < 1) {
        failJob('정렬할 대기열이 없습니다.');
      }
      reorderQueue(activePlayer, order);
      await updateMusicSetupMessage(activePlayer, activePlayer.queue.current ?? null).catch(() => {});
      await updateMusicState(activePlayer).catch(() => {});
      await logAction(job, 'success', '대기열 순서를 변경했어요.');
      break;
    }
    case 'remove': {
      const payload = asPayloadObject(job.payload) as { trackId?: Json; index?: Json } | null;
      const trackId = typeof payload?.trackId === 'string' ? payload.trackId : null;
      const index = typeof payload?.index === 'number' ? payload.index : null;
      const queue = activePlayer.queue.slice(0);

      if (queue.length < 1) {
        failJob('삭제할 대기열이 없습니다.');
      }

      const queueIndexFromId = trackId ? queue.findIndex((track) => track.track === trackId) : -1;
      const targetIndexRaw = queueIndexFromId >= 0 ? queueIndexFromId : index;
      const targetIndex = ensureInteger(targetIndexRaw, '삭제할 곡 정보를 찾지 못했습니다.');

      const removed = ensurePresent(removeQueueTrack(activePlayer, targetIndex), '삭제할 곡 정보를 찾지 못했습니다.');
      const removedTitle = removed.title;

      await updateMusicSetupMessage(activePlayer, activePlayer.queue.current ?? null).catch(() => {});
      await updateMusicState(activePlayer).catch(() => {});
      await logAction(job, 'success', `${removedTitle}을(를) 대기열에서 삭제했어요.`);
      break;
    }
    case 'clear': {
      if (activePlayer.queue.size < 1) {
        failJob('비울 대기열이 없습니다.');
      }

      activePlayer.queue.clear();
      await updateMusicSetupMessage(activePlayer, activePlayer.queue.current ?? null).catch(() => {});
      await updateMusicState(activePlayer).catch(() => {});
      await logAction(job, 'success', '대기열을 비웠어요.');
      break;
    }
    case 'add': {
      const payload = asPayloadObject(job.payload) as { query?: Json; requester?: Json } | null;
      const query = typeof payload?.query === 'string' ? payload.query : '';
      if (!query) {
        failJob('추가할 검색어를 입력해 주세요.');
      }

      const requester = asRequesterFromPayload(payload?.requester ?? null, job.requested_by);

      if (isSpotifyQuery(query)) {
        failJob('Spotify URL은 아직 지원하지 않아요. YouTube 또는 SoundCloud URL을 사용해 주세요.');
      }

      const searchResult = await searchTracksWithFallback(music, query, {
        id: requester.id,
        username: requester.username,
        displayName: requester.displayName ?? undefined,
        avatarUrl: requester.avatarUrl ?? undefined,
        source: requester.source
      });

      if (!searchResult.result.tracks.length) {
        failJob('검색 결과가 없습니다. URL이면 자동 보정 검색도 시도했지만 실패했어요.');
      }

      const fallbackNote = searchResult.fallbackUsed && searchResult.fallbackQuery
        ? ` (URL 자동 보정: ${searchResult.fallbackQuery})`
        : '';

      if (searchResult.result.type === 'PLAYLIST') {
        activePlayer.queue.add(searchResult.result.tracks);
        await logAction(job, 'success', `플레이리스트 ${searchResult.result.tracks.length}곡을 추가했어요.${fallbackNote}`);
      } else {
        const track = searchResult.result.tracks[0];
        activePlayer.queue.add(track);
        await logAction(job, 'success', `${track.title}을(를) 대기열에 추가했어요.${fallbackNote}`);
      }

      if (!activePlayer.playing && !activePlayer.paused) {
        await activePlayer.play();
      }

      await updateMusicSetupMessage(activePlayer, activePlayer.queue.current ?? null).catch(() => {});
      await updateMusicState(activePlayer).catch(() => {});
      break;
    }
    default:
      failJob(`지원하지 않는 명령입니다: ${job.action}`);
  }
};

export function startMusicControlWorker() {
  let isRunning = false;
  let pendingRerun = false;
  const ctx = getBotContext();

  const cleanupCompletedJobs = async () => {
    const expiresAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await ctx.supabase
      .from('music_control_jobs')
      .delete()
      .in('status', ['succeeded', 'failed'])
      .lt('updated_at', expiresAt);
  };

  const tick = async () => {
    if (isRunning) {
      pendingRerun = true;
      return;
    }

    isRunning = true;
    pendingRerun = false;

    try {
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

        console.log('[MusicWorker] job start', {
          jobId: job.job_id,
          guildId: job.guild_id,
          action: job.action,
          requestedBy: job.requested_by
        });

        let status: 'succeeded' | 'failed' = 'succeeded';
        let errorMessage: string | null = null;

        try {
          await handleJob(job);
          await ctx.supabase
            .from('music_control_jobs')
            .update({ status: 'succeeded', updated_at: new Date().toISOString(), error_message: null })
            .eq('job_id', job.job_id);
        } catch (e) {
          status = 'failed';
          errorMessage = e instanceof Error ? e.message : 'Unknown error';
          await ctx.supabase
            .from('music_control_jobs')
            .update({ status: 'failed', updated_at: new Date().toISOString(), error_message: errorMessage })
            .eq('job_id', job.job_id);
          await logAction(job, 'failed', errorMessage);
        } finally {
          console.log('[MusicWorker] job end', {
            jobId: job.job_id,
            guildId: job.guild_id,
            action: job.action,
            status,
            errorMessage
          });
        }
      }
    } finally {
      await cleanupCompletedJobs().catch((error) => {
        console.error('[MusicWorker] cleanup failed', error);
      });

      isRunning = false;

      if (pendingRerun) {
        void tick();
        return;
      }

      const config = await getAppConfig().catch(() => ({ bot_sync_interval_ms: 4000 }));
      setTimeout(() => {
        void tick();
      }, config.bot_sync_interval_ms || 4000);
    }
  };

  ctx.supabase
    .channel('music_control_jobs')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'nyang', table: 'music_control_jobs', filter: 'status=eq.pending' },
      () => {
        void tick();
      }
    )
    .subscribe();

  void tick();
}
