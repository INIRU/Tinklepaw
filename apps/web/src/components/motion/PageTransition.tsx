'use client';

import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export default function PageTransition(props: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={pathname}
        className={props.className}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
      >
        {props.children}
      </m.div>
    </AnimatePresence>
  );
}
