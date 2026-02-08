'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, ListMusic, GripVertical, Trash2, Activity, AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import { supabaseBrowser } from '@/lib/supabase-browser';
import { HoverStatusPopup } from '@/components/ui/HoverStatusPopup';
import FeedbackModal from './FeedbackModal';

type MusicTrack = {
  id: string;
  title: string;
  author: string;
  length: number;
  thumbnail?: string | null;
  uri?: string | null;
  requester?: {
    id?: string | null;
    username?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    source?: string | null;
  } | null;
};

type MusicState = {
  guild_id: string;
  current_track: MusicTrack | null;
  queue: MusicTrack[];
  updated_at: string;
};

type MusicLog = {
  log_id: string;
  action: string;
  status: string;
  message: string | null;
  payload: Record<string, unknown>;
  requested_by: string | null;
  requested_by_user?: { id: string; name: string; avatarUrl: string | null } | null;
  created_at: string;
};

type MonitorStatus = 'operational' | 'degraded' | 'down' | 'unknown';

type MonitorSample = {
  service: 'bot' | 'lavalink';
  status: MonitorStatus;
  created_at: string;
};

type MonitorIncident = {
  log_id: string;
  status: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type MonitorResponse = {
  services: {
    bot: MonitorSample[];
    lavalink: MonitorSample[];
  };
  incidents: MonitorIncident[];
};

type ControlAction = 'play' | 'pause' | 'stop' | 'skip' | 'previous' | 'add' | 'reorder' | 'remove' | 'clear';

type ControlResult = {
  ok: boolean;
  pending?: boolean;
  error?: string;
};

const resolveControlErrorMessage = (error: string | undefined, fallback: string) => {
  if (!error) return fallback;

  switch (error) {
    case 'BOT_ACK_TIMEOUT':
      return '봇 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.';
    case 'JOB_NOT_FOUND':
      return '요청 추적에 실패했습니다. 다시 시도해 주세요.';
    case 'ACK_LOOKUP_FAILED':
      return '요청 상태 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    case 'INVALID_REQUEST':
      return '요청 형식이 올바르지 않습니다.';
    default:
      return error;
  }
};

const formatDuration = (ms?: number | null) => {
  if (!ms) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const truncateText = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
};

const requesterName = (track: MusicTrack) =>
  track.requester?.displayName ?? track.requester?.username ?? (track.requester?.id ? `User ${track.requester.id.slice(0, 6)}` : '알 수 없음');

const normalizeStatus = (value: string): MonitorStatus => {
  if (value === 'operational' || value === 'degraded' || value === 'down') return value;
  return 'unknown';
};

const STATUS_LABEL: Record<MonitorStatus, string> = {
  operational: '정상',
  degraded: '지연',
  down: '다운',
  unknown: '알 수 없음'
};

const STATUS_BADGE: Record<MonitorStatus, string> = {
  operational: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
  degraded: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
  down: 'bg-rose-500/15 text-rose-300 border-rose-400/40',
  unknown: 'bg-zinc-500/15 text-zinc-300 border-zinc-400/40'
};

const STATUS_DOT: Record<MonitorStatus, string> = {
  operational: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  down: 'bg-rose-400',
  unknown: 'bg-zinc-400'
};

const statusLabel = (value: string) => STATUS_LABEL[normalizeStatus(value)];

const ServiceStatusCard = ({ title, samples }: { title: string; samples: MonitorSample[] }) => {
  const latest = samples.at(-1);
  const status = normalizeStatus(latest?.status ?? 'unknown');
  const bars = samples.slice(-24);

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] muted">Service</p>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <HoverStatusPopup
          title={`${title} 연결 상태`}
          statusLabel={STATUS_LABEL[status]}
          timestamp={latest?.created_at}
          description="최근 샘플 기준 연결 상태입니다."
        >
          <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </HoverStatusPopup>
      </div>

      <div className="flex items-center gap-1.5">
        {bars.length === 0 ? (
          <div className="text-xs muted">샘플 없음</div>
        ) : (
          bars.map((sample, index) => {
            const sampleStatus = normalizeStatus(sample.status);
            return (
              <HoverStatusPopup
                key={`${sample.created_at}-${index}`}
                title={`${title} 히스토리`}
                statusLabel={STATUS_LABEL[sampleStatus]}
                timestamp={sample.created_at}
                description="샘플 시점의 연결 상태입니다."
                className="flex-1"
              >
                <span className={`block h-2.5 w-full rounded-full ${STATUS_DOT[sampleStatus]}`} />
              </HoverStatusPopup>
            );
          })
        )}
      </div>

      <p className="text-xs muted">
        최신 갱신: {latest ? new Date(latest.created_at).toLocaleString() : '기록 없음'}
      </p>
    </div>
  );
};

const QueueRow = ({ track, disabled, onRemove }: { track: MusicTrack; disabled: boolean; onRemove: (track: MusicTrack) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: track.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 p-3">
      <button type="button" className="text-[color:var(--muted)]" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 shrink-0">
        {track.thumbnail && (
          <Image
            src={track.thumbnail}
            alt=""
            width={48}
            height={48}
            className="w-full h-full object-cover"
            unoptimized
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{truncateText(track.title, 44)}</div>
        <div className="text-xs muted truncate">{truncateText(track.author, 34)}</div>
        <div className="mt-1 inline-flex items-center gap-1.5 text-[11px] muted">
          <span className="w-4 h-4 rounded-full overflow-hidden bg-black/30 shrink-0">
            {track.requester?.avatarUrl && (
              <Image
                src={track.requester.avatarUrl}
                alt=""
                width={16}
                height={16}
                className="w-full h-full object-cover"
                unoptimized
              />
            )}
          </span>
          <span className="truncate">요청: {truncateText(requesterName(track), 24)}</span>
        </div>
      </div>
      <div className="text-xs muted">{formatDuration(track.length)}</div>
      <button
        type="button"
        onClick={() => onRemove(track)}
        disabled={disabled}
        className="rounded-lg border border-rose-500/30 px-2 py-1 text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default function MusicControlClient() {
  const [state, setState] = useState<MusicState | null>(null);
  const [logs, setLogs] = useState<MusicLog[]>([]);
  const [monitor, setMonitor] = useState<MonitorResponse>({ services: { bot: [], lavalink: [] }, incidents: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<ControlAction | null>(null);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ open: boolean; title: string; message: string; kind: 'success' | 'error' }>({
    open: false,
    title: '',
    message: '',
    kind: 'success'
  });
  const feedbackTimer = useRef<number | null>(null);
  const stateRefreshTimer = useRef<number | null>(null);

  const current = state?.current_track;
  const queue: MusicTrack[] = state?.queue ?? [];
  const isActionPending = pendingAction !== null;
  const canAdd = Boolean(current);
  const canStop = Boolean(current);
  const canSkip = Boolean(current) && queue.length > 0;
  const canClearQueue = queue.length > 0;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/music/state', { cache: 'no-store' });
      if (!res.ok) return false;
      const json = await res.json();
      setState(json.state ?? null);
      return true;
    } catch (error) {
      console.error('[Music] Failed to fetch state:', error);
      return false;
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/music/logs', { cache: 'no-store' });
      if (!res.ok) return false;
      const json = await res.json();
      setLogs(json.logs ?? []);
      return true;
    } catch (error) {
      console.error('[Music] Failed to fetch logs:', error);
      return false;
    }
  }, []);

  const fetchMonitor = useCallback(async () => {
    try {
      const res = await fetch('/api/music/monitor', { cache: 'no-store' });
      if (!res.ok) return false;
      const json = (await res.json().catch(() => null)) as
        | {
            services?: {
              bot?: MonitorSample[];
              lavalink?: MonitorSample[];
            };
            incidents?: MonitorIncident[];
          }
        | null;

      setMonitor({
        services: {
          bot: (json?.services?.bot ?? []).map((sample) => ({ ...sample, status: normalizeStatus(sample.status) })),
          lavalink: (json?.services?.lavalink ?? []).map((sample) => ({ ...sample, status: normalizeStatus(sample.status) }))
        },
        incidents: json?.incidents ?? []
      });
      return true;
    } catch (error) {
      console.error('[Music] Failed to fetch monitor data:', error);
      return false;
    }
  }, []);

  const scheduleStateRefresh = useCallback(() => {
    if (stateRefreshTimer.current) window.clearTimeout(stateRefreshTimer.current);
    stateRefreshTimer.current = window.setTimeout(() => {
      void fetchState();
    }, 150);
  }, [fetchState]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchState(), fetchLogs(), fetchMonitor()]);
    setIsLoading(false);
  }, [fetchLogs, fetchMonitor, fetchState]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshAll();
    }, 0);
    const stateChannel = supabaseBrowser
      .channel('music_state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'nyang', table: 'music_state' },
        () => {
          scheduleStateRefresh();
        }
      )
      .subscribe();

    const logsChannel = supabaseBrowser
      .channel('music_logs')
      .on('postgres_changes', { event: '*', schema: 'nyang', table: 'music_control_logs' }, () => {
        void fetchLogs();
      })
      .subscribe();

    const stateInterval = window.setInterval(fetchState, 15000);
    const logsInterval = window.setInterval(fetchLogs, 30000);
    const monitorInterval = window.setInterval(fetchMonitor, 20000);

    return () => {
      window.clearTimeout(initialLoad);
      supabaseBrowser.removeChannel(stateChannel);
      supabaseBrowser.removeChannel(logsChannel);
      window.clearInterval(stateInterval);
      window.clearInterval(logsInterval);
      window.clearInterval(monitorInterval);
      if (stateRefreshTimer.current) window.clearTimeout(stateRefreshTimer.current);
    };
  }, [fetchLogs, fetchMonitor, fetchState, refreshAll, scheduleStateRefresh]);

  useEffect(() => () => {
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
  }, []);

  useEffect(() => {
    if (!feedback.open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [feedback.open]);

  const showFeedback = (kind: 'success' | 'error', title: string, message: string) => {
    setFeedback({ open: true, title, message, kind });
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback((prev) => ({ ...prev, open: false }));
    }, 1600);
  };

  const sendControl = async (
    action: ControlAction,
    payload?: { query?: string; order?: string[]; trackId?: string; index?: number },
  ): Promise<ControlResult> => {
    const res = await fetch('/api/music/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; pending?: boolean; error?: string }
      | null;

    if (res.status === 202 || data?.pending) {
      await Promise.all([fetchLogs(), fetchState(), fetchMonitor()]);
      return {
        ok: false,
        pending: true,
        error: resolveControlErrorMessage(data?.error, '봇 응답이 지연되고 있어요. 잠시 후 로그를 확인해 주세요.'),
      };
    }

    if (res.ok && data?.ok !== false) {
      await Promise.all([fetchLogs(), fetchState(), fetchMonitor()]);
      window.setTimeout(() => {
        void fetchState();
        void fetchLogs();
        void fetchMonitor();
      }, 800);
      return { ok: true };
    }

    await Promise.all([fetchLogs(), fetchState(), fetchMonitor()]);
    return { ok: false, error: resolveControlErrorMessage(data?.error, '요청 실패') };
  };

  const runAction = async (action: 'play' | 'pause' | 'stop' | 'skip' | 'previous', successMessage: string) => {
    if (isActionPending) return;

    setPendingAction(action);
    try {
      const result = await sendControl(action);
      if (result.ok) {
        showFeedback('success', '완료', successMessage);
        return;
      }

      if (result.pending) {
        showFeedback('error', '응답 지연', result.error ?? '봇 응답이 지연되고 있어요.');
        return;
      }

      showFeedback('error', '실패', result.error ?? '요청 실패');
    } finally {
      setPendingAction(null);
    }
  };

  const submitAdd = async () => {
    if (isActionPending) return;

    const trimmed = query.trim();
    if (!trimmed) return;
    if (!canAdd) {
      showFeedback('error', '추가 불가', '현재 재생 중인 곡이 없어서 노래를 추가할 수 없습니다.');
      return;
    }

    setPendingAction('add');
    try {
      const result = await sendControl('add', { query: trimmed });
      if (result.ok) {
        showFeedback('success', '추가 완료', '대기열에 추가했어요.');
        setQuery('');
        return;
      }

      if (result.pending) {
        showFeedback('error', '응답 지연', result.error ?? '봇 응답이 지연되고 있어요.');
        return;
      }

      showFeedback('error', '추가 실패', result.error ?? '요청 실패');
    } finally {
      setPendingAction(null);
    }
  };

  const removeFromQueue = async (track: MusicTrack) => {
    if (isActionPending) return;

    setPendingAction('remove');
    const fallbackQueue = queue;
    setState((prev) => (prev ? { ...prev, queue: prev.queue.filter((item) => item.id !== track.id) } : prev));

    try {
      const result = await sendControl('remove', { trackId: track.id });
      if (result.ok) {
        showFeedback('success', '삭제 완료', `${truncateText(track.title, 26)}을(를) 대기열에서 삭제했어요.`);
        return;
      }

      setState((prev) => (prev ? { ...prev, queue: fallbackQueue } : prev));

      if (result.pending) {
        showFeedback('error', '응답 지연', result.error ?? '봇 응답이 지연되고 있어요.');
        return;
      }

      showFeedback('error', '삭제 실패', result.error ?? '요청 실패');
    } finally {
      setPendingAction(null);
    }
  };

  const clearQueue = async () => {
    if (isActionPending || !canClearQueue) return;

    setPendingAction('clear');
    const fallbackQueue = queue;
    setState((prev) => (prev ? { ...prev, queue: [] } : prev));

    try {
      const result = await sendControl('clear');
      if (result.ok) {
        showFeedback('success', '정리 완료', '대기열을 비웠어요.');
        return;
      }

      setState((prev) => (prev ? { ...prev, queue: fallbackQueue } : prev));

      if (result.pending) {
        showFeedback('error', '응답 지연', result.error ?? '봇 응답이 지연되고 있어요.');
        return;
      }

      showFeedback('error', '정리 실패', result.error ?? '요청 실패');
    } finally {
      setPendingAction(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (isActionPending) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = queue.findIndex((track) => track.id === activeId);
    const newIndex = queue.findIndex((track) => track.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextQueue = arrayMove(queue, oldIndex, newIndex) as MusicTrack[];
    setState((prev) => (prev ? { ...prev, queue: nextQueue } : prev));

    void (async () => {
      setPendingAction('reorder');
      try {
        const result = await sendControl('reorder', { order: nextQueue.map((track) => track.id) });
        if (result.ok) {
          showFeedback('success', '정렬 완료', '대기열 순서가 변경되었습니다.');
          return;
        }

        await fetchState();

        if (result.pending) {
          showFeedback('error', '응답 지연', result.error ?? '봇 응답이 지연되고 있어요.');
          return;
        }

        showFeedback('error', '정렬 실패', result.error ?? '요청 실패');
      } finally {
        setPendingAction(null);
      }
    })();
  };

  const currentDuration = useMemo(() => formatDuration(current?.length), [current?.length]);
  const latestBotStatus = monitor.services.bot.at(-1);
  const latestLavalinkStatus = monitor.services.lavalink.at(-1);
  const activeIncidents = monitor.incidents.filter((incident) => {
    const status = normalizeStatus(incident.status);
    return status === 'degraded' || status === 'down' || status === 'unknown';
  });

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)] relative">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] muted">Music Control</p>
            <h1 className="text-2xl font-bold font-bangul">디스코드 음악 컨트롤</h1>
            <p className="text-sm muted">서버 멤버만 접근 가능합니다.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refreshAll}
              disabled={isLoading || isActionPending}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>

        <section className="space-y-6">
          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[color:var(--chip)]">
                {current?.thumbnail && (
                  <Image
                    src={current.thumbnail}
                    alt=""
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm muted">현재 재생</div>
                <div className="text-lg font-semibold truncate">
                  {current?.title ? truncateText(current.title, 46) : '재생 중인 곡이 없습니다.'}
                </div>
                <div className="text-xs muted truncate">{current?.author ? truncateText(current.author, 34) : '-'}</div>
                {current && (
                  <div className="mt-1 inline-flex items-center gap-2 text-[11px] muted">
                    <span className="w-4 h-4 rounded-full overflow-hidden bg-black/30 shrink-0">
                      {current.requester?.avatarUrl && (
                        <Image
                          src={current.requester.avatarUrl}
                          alt=""
                          width={16}
                          height={16}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      )}
                    </span>
                    <span className="truncate">요청자: {truncateText(requesterName(current), 26)}</span>
                  </div>
                )}
                <div className="text-xs muted mt-1">{currentDuration}</div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd();
                }}
                disabled={!canAdd || isActionPending}
                placeholder={canAdd ? '노래 제목 또는 URL을 입력하세요' : '재생 중인 곡이 없어서 추가할 수 없어요'}
                className="flex-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={submitAdd}
                disabled={!canAdd || isActionPending}
                className="rounded-2xl border border-[color:var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                노래 추가
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => runAction('previous', '이전 곡으로 이동했어요.')}
                disabled={!canStop || isActionPending}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <SkipBack className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('play', '재생을 시작했어요.')}
                disabled={!canStop || isActionPending}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <Play className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('pause', '일시정지했어요.')}
                disabled={!canStop || isActionPending}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <Pause className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('stop', '재생을 중지했어요.')}
                disabled={!canStop || isActionPending}
                className="rounded-2xl border border-red-500/40 text-red-400 py-3 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <Square className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('skip', '다음 곡으로 이동했어요.')}
                disabled={!canSkip || isActionPending}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              >
                <SkipForward className="w-5 h-5 mx-auto" />
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4" />
                <h2 className="text-sm font-semibold">대기열 (드래그로 순서 변경)</h2>
              </div>
              <button
                type="button"
                onClick={clearQueue}
                disabled={!canClearQueue || isActionPending}
                className="rounded-xl border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                대기열 비우기
              </button>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((track) => track.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {queue.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-6 text-sm muted text-center">
                      대기열이 비어있습니다.
                    </div>
                  ) : (
                    queue.map((track) => (
                      <QueueRow key={track.id} track={track} disabled={isActionPending} onRemove={removeFromQueue} />
                    ))
                  )}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <h2 className="text-sm font-semibold">연결 모니터링</h2>
              </div>
              <span className="text-xs muted">최근 이벤트 {activeIncidents.length}건</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ServiceStatusCard title="Discord Bot" samples={monitor.services.bot} />
              <ServiceStatusCard title="Lavalink" samples={monitor.services.lavalink} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60 p-3">
                <div className="text-xs uppercase tracking-[0.12em] muted mb-1">Bot Status</div>
                <div className="text-sm font-semibold">{statusLabel(latestBotStatus?.status ?? 'unknown')}</div>
                <div className="text-xs muted mt-1">{latestBotStatus ? new Date(latestBotStatus.created_at).toLocaleString() : '기록 없음'}</div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60 p-3">
                <div className="text-xs uppercase tracking-[0.12em] muted mb-1">Lavalink Status</div>
                <div className="text-sm font-semibold">{statusLabel(latestLavalinkStatus?.status ?? 'unknown')}</div>
                <div className="text-xs muted mt-1">
                  {latestLavalinkStatus ? new Date(latestLavalinkStatus.created_at).toLocaleString() : '기록 없음'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs uppercase tracking-[0.12em] muted">최근 모니터링 이벤트</div>
              {monitor.incidents.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-4 text-xs muted text-center">
                  모니터링 이벤트가 없습니다.
                </div>
              ) : (
                monitor.incidents.slice(0, 6).map((incident) => {
                  const status = normalizeStatus(incident.status);
                  const payload = incident.payload ?? {};
                  const streak = typeof payload.streak === 'number' ? `${payload.streak}회` : '-';
                  const latency = typeof payload.latency_ms === 'number' ? `${payload.latency_ms}ms` : '-';
                  return (
                    <div key={incident.log_id} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/50 p-3">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <div className={`inline-flex items-center gap-1 text-[11px] font-semibold ${status === 'operational' ? 'text-emerald-300' : 'text-amber-300'}`}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {STATUS_LABEL[status]}
                        </div>
                        <div className="text-[11px] muted">{new Date(incident.created_at).toLocaleString()}</div>
                      </div>
                      <div className="text-xs">{incident.message ?? 'monitor event'}</div>
                      <div className="text-[11px] muted mt-1">연속 실패: {streak} · 지연: {latency}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6">
          <h2 className="text-sm font-semibold mb-4">조작 로그</h2>
          <div className="space-y-2">
            {logs.length === 0 && <div className="text-xs muted">아직 로그가 없습니다.</div>}
            {logs.map((log) => (
              <div key={log.log_id} className="flex flex-col gap-2 rounded-2xl border border-[color:var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-[color:var(--chip)] shrink-0">
                    {log.requested_by_user?.avatarUrl && (
                      <Image
                        src={log.requested_by_user.avatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{log.action}</div>
                    <div className="text-xs muted truncate">
                      {log.message ? truncateText(log.message, 60) : log.status}
                    </div>
                    <div className="text-[11px] muted truncate">
                      {log.requested_by_user ? `${log.requested_by_user.name} · ${log.requested_by_user.id}` : 'system'}
                    </div>
                  </div>
                </div>
                <div className="text-xs muted">{new Date(log.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <FeedbackModal feedback={feedback} />
    </div>
  );
}
