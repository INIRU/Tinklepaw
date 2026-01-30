'use client';

import { AnimatePresence, m } from 'framer-motion';
import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.dataset.theme;
  return t === 'dark' ? 'dark' : 'light';
}

function subscribeTheme(callback: () => void) {
  if (typeof document === 'undefined') return () => {};

  const observer = new MutationObserver(() => {
    callback();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const onStorage = (event: StorageEvent) => {
    if (event.key === 'bangul-theme') callback();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, () => 'light');

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('bangul-theme', next);
    } catch {}
  }, [theme]);

  return (
    <m.button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] shadow-sm"
      aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    >
      <AnimatePresence initial={false} mode="wait">
        {theme === 'dark' ? (
          <m.span
            key="moon"
            className="inline-flex"
            initial={{ opacity: 0, rotate: -30, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.8 }}
            transition={{ duration: 0.18 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path
                d="M21 14.5a8.38 8.38 0 0 1-10.9-10.9A9.5 9.5 0 1 0 21 14.5Z"
                fill="currentColor"
                fillOpacity="0.92"
              />
              <path
                d="M21 14.5a8.38 8.38 0 0 1-10.9-10.9"
                stroke="currentColor"
                strokeOpacity="0.28"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </m.span>
        ) : (
          <m.span
            key="sun"
            className="inline-flex"
            initial={{ opacity: 0, rotate: 30, scale: 0.8 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: -30, scale: 0.8 }}
            transition={{ duration: 0.18 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" fill="currentColor" fillOpacity="0.92" />
              <path
                d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"
                stroke="currentColor"
                strokeOpacity="0.55"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </m.span>
        )}
      </AnimatePresence>
    </m.button>
  );
}
