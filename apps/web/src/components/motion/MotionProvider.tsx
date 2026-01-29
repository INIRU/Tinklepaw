'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import type { ReactNode } from 'react';

export default function MotionProvider(props: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {props.children}
    </LazyMotion>
  );
}
