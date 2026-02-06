'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, ListMusic, GripVertical } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';

import { supabaseBrowser } from '@/lib/supabase-browser';
import FeedbackModal from './FeedbackModal';

type MusicTrack = {
  id: string;
  title: string;
  author: string;
  length: number;
  thumbnail?: string | null;
  uri?: string | null;
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

type ControlAction = 'play' | 'pause' | 'stop' | 'skip' | 'previous' | 'add' | 'reorder';

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

const QueueRow = ({ track }: { track: MusicTrack }) => {
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
      </div>
      <div className="text-xs muted">{formatDuration(track.length)}</div>
    </div>
  );
};

export default function MusicControlClient() {
  const [state, setState] = useState<MusicState | null>(null);
  const [logs, setLogs] = useState<MusicLog[]>([]);
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

  const scheduleStateRefresh = useCallback(() => {
    if (stateRefreshTimer.current) window.clearTimeout(stateRefreshTimer.current);
    stateRefreshTimer.current = window.setTimeout(() => {
      void fetchState();
    }, 150);
  }, [fetchState]);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([fetchState(), fetchLogs()]);
    setIsLoading(false);
  }, [fetchLogs, fetchState]);

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

    return () => {
      window.clearTimeout(initialLoad);
      supabaseBrowser.removeChannel(stateChannel);
      supabaseBrowser.removeChannel(logsChannel);
      window.clearInterval(stateInterval);
      window.clearInterval(logsInterval);
      if (stateRefreshTimer.current) window.clearTimeout(stateRefreshTimer.current);
    };
  }, [fetchLogs, fetchState, refreshAll, scheduleStateRefresh]);

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
    payload?: { query?: string; order?: string[] },
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
      await Promise.all([fetchLogs(), fetchState()]);
      return {
        ok: false,
        pending: true,
        error: resolveControlErrorMessage(data?.error, '봇 응답이 지연되고 있어요. 잠시 후 로그를 확인해 주세요.'),
      };
    }

    if (res.ok && data?.ok !== false) {
      await Promise.all([fetchLogs(), fetchState()]);
      window.setTimeout(() => {
        void fetchState();
        void fetchLogs();
      }, 800);
      return { ok: true };
    }

    await Promise.all([fetchLogs(), fetchState()]);
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
            <div className="flex items-center gap-2 mb-4">
              <ListMusic className="w-4 h-4" />
              <h2 className="text-sm font-semibold">대기열 (드래그로 순서 변경)</h2>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={queue.map((track) => track.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {queue.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[color:var(--border)] p-6 text-sm muted text-center">
                      대기열이 비어있습니다.
                    </div>
                  ) : (
                    queue.map((track) => <QueueRow key={track.id} track={track} />)
                  )}
                </div>
              </SortableContext>
            </DndContext>
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
