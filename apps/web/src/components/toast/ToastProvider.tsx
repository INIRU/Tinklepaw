'use client';

import { AnimatePresence, m } from 'framer-motion';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  createdAt: number;
};

type ToastApi = {
  push: (t: { type: ToastType; title?: string; message: string; durationMs?: number }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  success: (message: string, opts?: { title?: string; durationMs?: number }) => string;
  error: (message: string, opts?: { title?: string; durationMs?: number }) => string;
  info: (message: string, opts?: { title?: string; durationMs?: number }) => string;
};

const ToastContext = createContext<ToastApi | null>(null);

function borderClass(type: ToastType) {
  if (type === 'success') return 'border-emerald-200/30';
  if (type === 'error') return 'border-red-200/30';
  return 'border-white/10';
}

function dotClass(type: ToastType) {
  if (type === 'success') return 'bg-emerald-200/80';
  if (type === 'error') return 'bg-red-200/80';
  return 'bg-zinc-200/80';
}

export function ToastProvider(props: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, number>());
  const seqRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    timersRef.current.clear();
    setItems([]);
  }, []);

  const push = useCallback(
    (t: { type: ToastType; title?: string; message: string; durationMs?: number }) => {
      const id = `${Date.now()}-${++seqRef.current}`;
      const durationMs = t.durationMs ?? (t.type === 'error' ? 6500 : 3500);
      const item: ToastItem = { id, type: t.type, title: t.title, message: t.message, createdAt: Date.now() };

      setItems((prev) => [item, ...prev].slice(0, 5));
      const timer = window.setTimeout(() => dismiss(id), durationMs);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(() => {
    return {
      push,
      dismiss,
      clear,
      success: (message, opts) => push({ type: 'success', message, ...opts }),
      error: (message, opts) => push({ type: 'error', message, ...opts }),
      info: (message, opts) => push({ type: 'info', message, ...opts }),
    };
  }, [clear, dismiss, push]);

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
        <div className="pointer-events-auto flex flex-col-reverse gap-2">
          <AnimatePresence initial={false}>
            {items.map((t) => (
              <m.div
                key={t.id}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`rounded-2xl border ${borderClass(t.type)} bg-[color:var(--bg)]/80 backdrop-blur shadow-lg`}
              >
                <div className="flex items-start gap-3 p-4">
                  <div aria-hidden="true" className={`${dotClass(t.type)} mt-2 h-2 w-2 shrink-0 rounded-full`} />
                  <div className="min-w-0 flex-1">
                    {t.title ? <div className="text-xs font-semibold text-[color:var(--fg)]">{t.title}</div> : null}
                    <div className="text-sm text-[color:var(--fg)]">{t.message}</div>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs muted hover:bg-white/10"
                    onClick={() => dismiss(t.id)}
                  >
                    닫기
                  </button>
                </div>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
