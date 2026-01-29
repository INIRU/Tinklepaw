'use client';

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, ListMusic, GripVertical, CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';


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

const formatDuration = (ms?: number | null) => {
  if (!ms) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        {track.thumbnail && <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{track.title}</div>
        <div className="text-xs muted truncate">{track.author}</div>
      </div>
      <div className="text-xs muted">{formatDuration(track.length)}</div>
    </div>
  );
};

export default function MusicControlClient() {
  const [state, setState] = useState<MusicState | null>(null);
  const [logs, setLogs] = useState<MusicLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ open: boolean; title: string; message: string; kind: 'success' | 'error' }>({
    open: false,
    title: '',
    message: '',
    kind: 'success'
  });
  const feedbackTimer = useRef<number | null>(null);

  const queue: MusicTrack[] = state?.queue ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const fetchState = async () => {
    const res = await fetch('/api/music/state');
    const json = await res.json();
    setState(json.state ?? null);
  };

  const fetchLogs = async () => {
    const res = await fetch('/api/music/logs');
    const json = await res.json();
    setLogs(json.logs ?? []);
  };

  const refreshAll = async () => {
    setIsLoading(true);
    await Promise.all([fetchState(), fetchLogs()]);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshAll();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const sendControl = async (action: 'play' | 'pause' | 'stop' | 'skip' | 'previous' | 'add', payload?: { query?: string }) => {
    const res = await fetch('/api/music/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error ?? '요청 실패' };
    }
    await fetchLogs();
    return { ok: true };
  };

  const sendReorder = async (order: string[]) => {
    const res = await fetch('/api/music/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reorder', payload: { order } })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error ?? '정렬 실패' };
    }
    await fetchLogs();
    return { ok: true };
  };

  const runAction = async (action: 'play' | 'pause' | 'stop' | 'skip' | 'previous', successMessage: string) => {
    const result = await sendControl(action);
    if (result.ok) showFeedback('success', '완료', successMessage);
    else showFeedback('error', '실패', result.error ?? '요청 실패');
  };

  const submitAdd = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const result = await sendControl('add', { query: trimmed });
    if (result.ok) showFeedback('success', '추가 완료', '대기열에 추가했어요.');
    else showFeedback('error', '추가 실패', result.error ?? '요청 실패');
    setQuery('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const oldIndex = queue.findIndex((track) => track.id === activeId);
    const newIndex = queue.findIndex((track) => track.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;

    const nextQueue = arrayMove(queue, oldIndex, newIndex) as MusicTrack[];
    setState((prev) => (prev ? { ...prev, queue: nextQueue } : prev));
    sendReorder(nextQueue.map((track) => track.id))
      .then((result) => {
        if (result.ok) showFeedback('success', '정렬 완료', '대기열 순서가 변경되었습니다.');
        else showFeedback('error', '정렬 실패', result.error ?? '요청 실패');
      })
      .catch(() => null);
  };

  const current = state?.current_track;
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
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold hover:bg-[color:var(--chip)]"
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
                {current?.thumbnail && <img src={current.thumbnail} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm muted">현재 재생</div>
                <div className="text-lg font-semibold truncate">{current?.title ?? '재생 중인 곡이 없습니다.'}</div>
                <div className="text-xs muted truncate">{current?.author ?? '-'}</div>
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
                placeholder="노래 제목 또는 URL을 입력하세요"
                className="flex-1 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/20"
              />
              <button
                type="button"
                onClick={submitAdd}
                className="rounded-2xl border border-[color:var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]"
              >
                노래 추가
              </button>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => runAction('previous', '이전 곡으로 이동했어요.')}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)]"
              >
                <SkipBack className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('play', '재생을 시작했어요.')}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)]"
              >
                <Play className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('pause', '일시정지했어요.')}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)]"
              >
                <Pause className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('stop', '재생을 중지했어요.')}
                className="rounded-2xl border border-red-500/40 text-red-400 py-3 hover:bg-red-500/10"
              >
                <Square className="w-5 h-5 mx-auto" />
              </button>
              <button
                type="button"
                onClick={() => runAction('skip', '다음 곡으로 이동했어요.')}
                className="rounded-2xl border border-[color:var(--border)] py-3 hover:bg-[color:var(--chip)]"
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
                      <img src={log.requested_by_user.avatarUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{log.action}</div>
                    <div className="text-xs muted truncate">{log.message ?? log.status}</div>
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

      {feedback.open && (
        <div className="fixed inset-0 z-[60] flex h-screen w-screen items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-[32px] border border-[color:var(--border)] bg-[color:var(--card)] p-8 text-center shadow-2xl">
            <div
              className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border shadow-[0_0_40px_rgba(16,185,129,0.15)] ${
                feedback.kind === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
              }`}
            >
              {feedback.kind === 'success' ? (
                <CheckCircle className="h-10 w-10" strokeWidth={1.5} />
              ) : (
                <XCircle className="h-10 w-10" strokeWidth={1.5} />
              )}
            </div>
            <h2 className="text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2">{feedback.title}</h2>
            <p className="text-sm text-[color:var(--muted)] leading-relaxed">{feedback.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
