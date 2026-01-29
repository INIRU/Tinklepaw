'use client';

import { m } from 'framer-motion';

export function Skeleton(props: { className?: string }) {
  return (
    <m.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      className={`rounded-xl bg-[color:var(--border)] ${props.className}`}
    />
  );
}
