'use client';

import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition(props: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        initial={reduce ? false : { opacity: 0, y: 10, filter: 'blur(1px)' }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={reduce ? { opacity: 1 } : { opacity: 0, y: -6, filter: 'blur(1px)' }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {props.children}
      </m.div>
    </AnimatePresence>
  );
}
