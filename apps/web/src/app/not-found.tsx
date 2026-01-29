import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full rounded-[32px] border border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center shadow-xl">
        <div className="text-xs uppercase tracking-[0.3em] muted">404</div>
        <h1 className="mt-3 text-3xl font-bold font-bangul">페이지를 찾을 수 없어요</h1>
        <p className="mt-3 text-sm muted">주소가 잘못되었거나, 삭제된 페이지일 수 있습니다.</p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-full border border-[color:var(--border)] px-5 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]"
          >
            홈으로 이동
          </Link>
          <Link
            href="/support"
            className="rounded-full border border-[color:var(--border)] px-5 py-2 text-sm font-semibold hover:bg-[color:var(--chip)]"
          >
            문의하기
          </Link>
        </div>
      </div>
    </div>
  );
}
