'use client';

import { m } from 'framer-motion';
import type { ReactNode } from 'react';

export default function MotionIn(props: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  scale?: number;
}) {
  const y = props.y ?? 12;
  const scale = props.scale ?? 1;
  const delay = props.delay ?? 0;

  return (
    <m.div
      className={props.className}
      initial={{ opacity: 0, y, scale: scale === 1 ? 1 : scale }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {props.children}
    </m.div>
  );
}
