'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[web/error]', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full rounded-[32px] border border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center shadow-xl">
        <div className="text-xs uppercase tracking-[0.3em] muted">500</div>
        <h1 className="mt-3 text-3xl font-bold font-bangul">문제가 발생했어요</h1>
        <p className="mt-3 text-sm muted">일시적인 오류일 수 있습니다. 잠시 후 다시 시도해 주세요.</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-[color:var(--border)] px-5 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-full border border-[color:var(--border)] px-5 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
