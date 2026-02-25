'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, ListMusic, GripVertical, Trash2, Activity, AlertTriangle, Music2 } from 'lucide-react';
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

type LogStatusTone = 'success' | 'pending' | 'error' | 'neutral';
type LogFilter = 'all' | 'success' | 'pending' | 'error';

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

const STATUS_DOT_GLOW: Record<MonitorStatus, string> = {
  operational: 'shadow-[0_0_6px_rgba(52,211,153,0.7)]',
  degraded: 'shadow-[0_0_6px_rgba(251,191,36,0.7)]',
  down: 'shadow-[0_0_6px_rgba(239,68,68,0.7)]',
  unknown: 'shadow-[0_0_4px_rgba(161,161,170,0.5)]'
};

const statusLabel = (value: string) => STATUS_LABEL[normalizeStatus(value)];

const classifyLogStatus = (status: string): LogStatusTone => {
  const normalized = status.toLowerCase();

  if (['error', 'failed', 'fail', 'timeout', 'rejected'].some((keyword) => normalized.includes(keyword))) {
    return 'error';
  }

  if (['pending', 'queued', 'waiting', 'accepted', 'processing'].some((keyword) => normalized.includes(keyword))) {
    return 'pending';
  }

  if (['ok', 'success', 'done', 'completed'].some((keyword) => normalized.includes(keyword))) {
    return 'success';
  }

  return 'neutral';
};

const LOG_FILTER_LABEL: Record<LogFilter, string> = {
  all: '전체',
  success: '성공',
  pending: '대기',
  error: '실패'
};

const LOG_STATUS_LABEL: Record<LogStatusTone, string> = {
  success: '성공',
  pending: '대기',
  error: '실패',
  neutral: '기타'
};

const LOG_STATUS_BADGE: Record<LogStatusTone, string> = {
  success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  pending: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
  error: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
  neutral: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-300'
};

/* Equalizer bars shown when music is playing */
const EqBars = () => (
  <div className="flex items-end gap-[3px] h-4" aria-hidden="true">
    <span className="w-1 rounded-sm bg-[color:var(--accent-pink)] animate-eq-1" style={{ height: '7px' }} />
    <span className="w-1 rounded-sm bg-[color:var(--accent-pink-2)] animate-eq-2" style={{ height: '12px' }} />
    <span className="w-1 rounded-sm bg-[color:var(--accent-lavender)] animate-eq-3" style={{ height: '5px' }} />
  </div>
);

const ServiceStatusCard = ({ title, samples }: { title: string; samples: MonitorSample[] }) => {
  const latest = samples.at(-1);
  const status = normalizeStatus(latest?.status ?? 'unknown');
  const bars = samples.slice(-24);

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/50 p-4 space-y-3 relative overflow-hidden">
      {/* Subtle top gradient accent */}
      <div className={`absolute top-0 left-0 right-0 h-px ${
        status === 'operational' ? 'bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent' :
        status === 'degraded' ? 'bg-gradient-to-r from-transparent via-amber-400/50 to-transparent' :
        status === 'down' ? 'bg-gradient-to-r from-transparent via-rose-400/50 to-transparent' :
        'bg-gradient-to-r from-transparent via-zinc-400/30 to-transparent'
      }`} />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] muted-2">Service</p>
          <h3 className="text-sm font-semibold mt-0.5">{title}</h3>
        </div>
        <HoverStatusPopup
          title={`${title} 연결 상태`}
          statusLabel={STATUS_LABEL[status]}
          timestamp={latest?.created_at}
          description="최근 샘플 기준 연결 상태입니다."
        >
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${STATUS_BADGE[status]}`}>
            {/* Live dot for operational */}
            <span className={`relative flex h-1.5 w-1.5`}>
              <span className={`inline-flex rounded-full h-1.5 w-1.5 ${STATUS_DOT[status]} ${STATUS_DOT_GLOW[status]}`} />
              {status === 'operational' && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/50 animate-dot-ping" />
              )}
            </span>
            {STATUS_LABEL[status]}
          </span>
        </HoverStatusPopup>
      </div>

      {/* History bars */}
      <div className="flex items-center gap-[3px]">
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
                <span className={`block h-3 w-full rounded-sm ${STATUS_DOT[sampleStatus]} transition-opacity hover:opacity-80`} />
              </HoverStatusPopup>
            );
          })
        )}
      </div>

      <p className="text-[11px] muted">
        최신 갱신: {latest ? new Date(latest.created_at).toLocaleString() : '기록 없음'}
      </p>
    </div>
  );
};

const QueueRow = ({
  track,
  index,
  disabled,
  onRemove
}: {
  track: MusicTrack;
  index: number;
  disabled: boolean;
  onRemove: (track: MusicTrack) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: track.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} className="queue-row flex items-center gap-3 p-3">
      {/* Drag handle */}
      <button
        type="button"
        className="text-[color:var(--muted-2)] hover:text-[color:var(--muted)] transition-colors shrink-0 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Position number */}
      <div className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-1.5 text-[11px] font-semibold text-[color:var(--muted)] shrink-0">
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div className="w-11 h-11 rounded-xl overflow-hidden bg-[color:var(--chip)] shrink-0 shadow-sm border border-[color:var(--border)]/50">
        {track.thumbnail ? (
          <Image
            src={track.thumbnail}
            alt=""
            width={44}
            height={44}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="w-4 h-4 text-[color:var(--muted-2)]" />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        {track.uri ? (
          <a
            href={track.uri}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-semibold decoration-dotted underline-offset-2 hover:underline hover:text-[color:var(--accent-sky)] transition-colors"
            title={track.title}
          >
            {truncateText(track.title, 44)}
          </a>
        ) : (
          <div className="text-sm font-semibold truncate">{truncateText(track.title, 44)}</div>
        )}
        <div className="text-xs muted truncate">{truncateText(track.author, 34)}</div>
        <div className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] muted">
          <span className="w-3.5 h-3.5 rounded-full overflow-hidden bg-[color:var(--chip)] shrink-0 border border-[color:var(--border)]/40">
            {track.requester?.avatarUrl && (
              <Image
                src={track.requester.avatarUrl}
                alt=""
                width={14}
                height={14}
                className="w-full h-full object-cover"
                unoptimized
              />
            )}
          </span>
          <span className="truncate">요청: {truncateText(requesterName(track), 24)}</span>
        </div>
      </div>

      {/* Duration */}
      <div className="text-xs muted font-mono shrink-0">{formatDuration(track.length)}</div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(track)}
        disabled={disabled}
        className="rounded-lg border border-rose-500/25 px-2 py-1.5 text-rose-400 hover:bg-rose-500/12 hover:border-rose-500/45 disabled:cursor-not-allowed disabled:opacity-50 transition-colors shrink-0"
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
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
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
      setLogs((json.logs ?? []).filter((entry: MusicLog) => entry.action !== 'monitor'));
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

  const submitAdd = async (overrideQuery?: string) => {
    if (isActionPending) return;

    const trimmed = (overrideQuery ?? query).trim();
    if (!trimmed) return;
    if (overrideQuery !== undefined) setQuery(trimmed);

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

  const pasteAndAdd = async () => {
    if (isActionPending) return;
    if (!canAdd) {
      showFeedback('error', '추가 불가', '현재 재생 중인 곡이 없어서 노래를 추가할 수 없습니다.');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      showFeedback('error', '클립보드 미지원', '브라우저 클립보드 권한이 필요합니다.');
      return;
    }

    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();
      if (!clipboardText) {
        showFeedback('error', '붙여넣기 실패', '클립보드에서 노래 제목이나 URL을 찾지 못했어요.');
        return;
      }

      await submitAdd(clipboardText);
    } catch (error) {
      console.error('[Music] Failed to read clipboard:', error);
      showFeedback('error', '붙여넣기 실패', '클립보드 읽기에 실패했습니다. 권한을 확인해 주세요.');
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
  const queueDurationMs = useMemo(
    () => queue.reduce((total, track) => total + (typeof track.length === 'number' ? track.length : 0), 0),
    [queue]
  );
  const queueDuration = useMemo(() => formatDuration(queueDurationMs), [queueDurationMs]);
  const totalSessionDuration = useMemo(
    () => formatDuration((typeof current?.length === 'number' ? current.length : 0) + queueDurationMs),
    [current?.length, queueDurationMs]
  );
  const queueRequesterCount = useMemo(
    () => new Set(queue.map((track) => requesterName(track))).size,
    [queue]
  );
  const logSummary = useMemo(() => {
    const summary: Record<LogFilter, number> = { all: logs.length, success: 0, pending: 0, error: 0 };
    logs.forEach((log) => {
      const tone = classifyLogStatus(log.status);
      if (tone === 'success' || tone === 'pending' || tone === 'error') {
        summary[tone] += 1;
      }
    });
    return summary;
  }, [logs]);
  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((log) => classifyLogStatus(log.status) === logFilter);
  }, [logFilter, logs]);
  const latestBotStatus = monitor.services.bot.at(-1);
  const latestLavalinkStatus = monitor.services.lavalink.at(-1);
  const activeIncidents = monitor.incidents.filter((incident) => {
    const status = normalizeStatus(incident.status);
    return status === 'degraded' || status === 'down' || status === 'unknown';
  });

  return (
    <div className="min-h-screen bg-[color:var(--bg)] text-[color:var(--fg)] relative">
      {/* Subtle ambient background decoration */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-[color:var(--accent-pink)]/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-[color:var(--accent-sky)]/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-10 space-y-6">

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] muted-2">Music Control</p>
            <h1 className="text-2xl font-bold font-bangul mt-0.5">디스코드 음악 컨트롤</h1>
            <p className="text-sm muted mt-0.5">서버 멤버만 접근 가능합니다.</p>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={isLoading || isActionPending}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-4 py-2 text-xs font-semibold hover:bg-[color:var(--chip)] hover:border-[color:var(--accent-sky)]/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* ── NOW PLAYING ── */}
        <section className="music-card overflow-hidden">
          {/* Artwork hero with gradient overlay */}
          <div className="relative">
            {/* Large blurred artwork background */}
            {current?.thumbnail && (
              <div className="absolute inset-0 overflow-hidden">
                <Image
                  src={current.thumbnail}
                  alt=""
                  fill
                  className="object-cover scale-110 blur-2xl opacity-20"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[color:var(--card)]/60 to-[color:var(--card)]" />
              </div>
            )}

            <div className="relative p-6 pb-4">
              <div className="flex items-start gap-5">
                {/* Artwork */}
                <div className="relative shrink-0">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-[color:var(--chip)] shadow-[0_8px_24px_rgba(0,0,0,0.3)] border border-[color:var(--border)]/60">
                    {current?.thumbnail ? (
                      <Image
                        src={current.thumbnail}
                        alt=""
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[color:var(--accent-pink)]/20 to-[color:var(--accent-lavender)]/20">
                        <Music2 className="w-10 h-10 text-[color:var(--muted-2)]" />
                      </div>
                    )}
                  </div>
                  {/* Playing indicator badge */}
                  {current && (
                    <div className="absolute -bottom-2 -right-2 rounded-full bg-[color:var(--accent-pink)] p-1.5 shadow-lg shadow-[color:var(--accent-pink)]/30">
                      <EqBars />
                    </div>
                  )}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0 pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--accent-pink)] mb-1">
                    현재 재생
                  </div>
                  <div className="text-xl font-bold leading-tight truncate">
                    {current?.title ? truncateText(current.title, 46) : '재생 중인 곡이 없습니다.'}
                  </div>
                  <div className="text-sm muted truncate mt-0.5">
                    {current?.author ? truncateText(current.author, 40) : '-'}
                  </div>

                  {current && (
                    <div className="mt-2 inline-flex items-center gap-2 text-[11px] muted bg-[color:var(--chip)]/60 rounded-full px-2.5 py-1 border border-[color:var(--border)]/60">
                      <span className="w-4 h-4 rounded-full overflow-hidden bg-[color:var(--chip)] shrink-0">
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
                      <span className="text-[color:var(--muted-2)]">·</span>
                      <span className="font-mono text-[color:var(--muted)]">{currentDuration}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Add to queue input */}
          <div className="px-6 pb-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd();
                }}
                disabled={!canAdd || isActionPending}
                placeholder={canAdd ? '노래 제목 또는 URL을 입력하세요' : '재생 중인 곡이 없어서 추가할 수 없어요'}
                className="flex-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/70 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/25 focus:border-[color:var(--accent-pink)]/35 disabled:cursor-not-allowed disabled:opacity-60 transition-[box-shadow,border-color]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={pasteAndAdd}
                  disabled={!canAdd || isActionPending}
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-3 py-2.5 text-xs font-semibold hover:bg-[color:var(--chip)] hover:border-[color:var(--accent-sky)]/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent transition-colors"
                >
                  붙여넣기 추가
                </button>
                <button
                  type="button"
                  onClick={() => submitAdd()}
                  disabled={!canAdd || isActionPending}
                  className="rounded-2xl border border-[color:var(--accent-pink)]/30 bg-gradient-to-r from-[color:var(--accent-pink)]/15 to-[color:var(--accent-lavender)]/10 px-4 py-2.5 text-sm font-semibold hover:from-[color:var(--accent-pink)]/22 hover:to-[color:var(--accent-lavender)]/16 hover:border-[color:var(--accent-pink)]/45 disabled:cursor-not-allowed disabled:opacity-60 transition-all text-[color:var(--fg)]"
                >
                  노래 추가
                </button>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="px-6 pb-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              { label: '대기열 곡 수', value: `${queue.length}곡` },
              { label: '대기열 길이', value: queueDuration },
              { label: '세션 총 길이', value: totalSessionDuration },
              { label: '요청자 수', value: `${queueRequesterCount}명` }
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-[color:var(--border)]/70 bg-[color:var(--chip)]/50 px-3 py-2.5">
                <div className="muted-2 text-[10px] uppercase tracking-wide">{label}</div>
                <div className="mt-1 text-sm font-bold">{value}</div>
              </div>
            ))}
          </div>

          {/* Transport controls */}
          <div className="px-6 pb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button
              type="button"
              onClick={() => runAction('previous', '이전 곡으로 이동했어요.')}
              disabled={!canStop || isActionPending}
              className="btn-transport py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-1.5">
                <SkipBack className="w-5 h-5" />
                <span className="text-[11px] font-semibold">이전</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => runAction('play', '재생을 시작했어요.')}
              disabled={!canStop || isActionPending}
              className="btn-transport py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-1.5">
                <Play className="w-5 h-5" />
                <span className="text-[11px] font-semibold">재생</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => runAction('pause', '일시정지했어요.')}
              disabled={!canStop || isActionPending}
              className="btn-transport py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-1.5">
                <Pause className="w-5 h-5" />
                <span className="text-[11px] font-semibold">일시정지</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => runAction('stop', '재생을 중지했어요.')}
              disabled={!canStop || isActionPending}
              className="btn-transport btn-transport-stop py-3.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-1.5">
                <Square className="w-5 h-5" />
                <span className="text-[11px] font-semibold">정지</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => runAction('skip', '다음 곡으로 이동했어요.')}
              disabled={!canSkip || isActionPending}
              className="btn-transport py-3.5 col-span-2 sm:col-span-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col items-center gap-1.5">
                <SkipForward className="w-5 h-5" />
                <span className="text-[11px] font-semibold">다음</span>
              </div>
            </button>
          </div>
        </section>

        {/* ── QUEUE ── */}
        <section className="music-card p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-[color:var(--accent-sky)]" />
                <h2 className="text-sm font-semibold">대기열</h2>
                <span className="text-[11px] muted">(드래그로 순서 변경)</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-2.5 py-1 text-[color:var(--muted)]">
                  총 {queue.length}곡
                </span>
                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-2.5 py-1 text-[color:var(--muted)]">
                  {queueDuration}
                </span>
                <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 px-2.5 py-1 text-[color:var(--muted)]">
                  갱신 {state?.updated_at ? new Date(state.updated_at).toLocaleTimeString() : '-'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={clearQueue}
              disabled={!canClearQueue || isActionPending}
              className="shrink-0 rounded-xl border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/50 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              대기열 비우기
            </button>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={queue.map((track) => track.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {queue.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-8 text-sm muted text-center flex flex-col items-center gap-3">
                    <Music2 className="w-8 h-8 text-[color:var(--muted-2)]" />
                    대기열이 비어있습니다.
                  </div>
                ) : (
                  queue.map((track, index) => (
                    <QueueRow key={track.id} track={track} index={index} disabled={isActionPending} onRemove={removeFromQueue} />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </section>

        {/* ── CONNECTION MONITOR ── */}
        <section className="music-card p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[color:var(--accent-mint)]" />
              <h2 className="text-sm font-semibold">연결 모니터링</h2>
            </div>
            <span className="text-[11px] rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/50 px-2.5 py-1 text-[color:var(--muted)]">
              최근 이벤트 {activeIncidents.length}건
            </span>
          </div>

          {/* Service cards */}
          <div className="grid gap-3 md:grid-cols-2">
            <ServiceStatusCard title="Discord Bot" samples={monitor.services.bot} />
            <ServiceStatusCard title="Lavalink" samples={monitor.services.lavalink} />
          </div>

          {/* Quick status summary */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Bot Status', status: latestBotStatus?.status ?? 'unknown', time: latestBotStatus?.created_at },
              { label: 'Lavalink Status', status: latestLavalinkStatus?.status ?? 'unknown', time: latestLavalinkStatus?.created_at }
            ].map(({ label, status, time }) => {
              const normalized = normalizeStatus(status);
              return (
                <div key={label} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/40 p-3 flex items-center gap-3">
                  <span className={`relative flex h-2.5 w-2.5 shrink-0`}>
                    <span className={`inline-flex rounded-full h-2.5 w-2.5 ${STATUS_DOT[normalized]} ${STATUS_DOT_GLOW[normalized]}`} />
                    {normalized === 'operational' && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/40 animate-dot-ping" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.12em] muted-2">{label}</div>
                    <div className="text-sm font-semibold">{statusLabel(status)}</div>
                    <div className="text-[11px] muted">{time ? new Date(time).toLocaleString() : '기록 없음'}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Incidents */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.14em] muted-2">최근 모니터링 이벤트</div>
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
                  <div key={incident.log_id} className="log-row px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${status === 'operational' ? 'text-emerald-400' : 'text-amber-400'}`}>
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
        </section>

        {/* ── OPERATION LOG ── */}
        <section className="music-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">조작 로그</h2>
            <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)]/60 p-1">
              {(['all', 'success', 'pending', 'error'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setLogFilter(filter)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                    logFilter === filter
                      ? 'bg-[color:var(--accent-pink)]/18 text-[color:var(--fg)] border border-[color:var(--accent-pink)]/25'
                      : 'text-[color:var(--muted)] hover:bg-[color:var(--chip)]'
                  }`}
                >
                  {LOG_FILTER_LABEL[filter]}
                  <span className={`ml-1.5 ${logFilter === filter ? 'text-[color:var(--muted)]' : 'text-[color:var(--muted-2)]'}`}>
                    {logSummary[filter]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredLogs.length === 0 && (
              <div className="text-xs muted py-4 text-center">
                {logs.length === 0 ? '아직 로그가 없습니다.' : '선택한 필터에 해당하는 로그가 없습니다.'}
              </div>
            )}
            {filteredLogs.map((log) => {
              const logTone = classifyLogStatus(log.status);
              return (
                <div
                  key={log.log_id}
                  className="log-row flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[color:var(--chip)] shrink-0 border border-[color:var(--border)]/50">
                      {log.requested_by_user?.avatarUrl ? (
                        <Image
                          src={log.requested_by_user.avatarUrl}
                          alt=""
                          width={36}
                          height={36}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-[color:var(--muted-2)]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold truncate">{log.action}</div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LOG_STATUS_BADGE[logTone]}`}>
                          {LOG_STATUS_LABEL[logTone]}
                        </span>
                      </div>
                      <div className="text-xs muted truncate mt-0.5">
                        {log.message ? truncateText(log.message, 60) : log.status}
                      </div>
                      <div className="text-[11px] muted-2 truncate">
                        {log.requested_by_user ? `${log.requested_by_user.name} · ${log.requested_by_user.id}` : 'system'}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] muted shrink-0 font-mono">{new Date(log.created_at).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <FeedbackModal feedback={feedback} />
    </div>
  );
}
