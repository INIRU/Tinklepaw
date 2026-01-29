import { Skeleton } from '@/components/ui/Skeleton';

export default function DrawLoading() {
  return (
    <main className='flex h-[calc(100vh-64px)] overflow-hidden'>
      {/* Left Sidebar - Pool List */}
      <aside className='w-80 border-r border-[color:var(--border)] bg-[color:var(--card)] p-4 overflow-y-auto flex-shrink-0 z-10 hidden md:block'>
        <div className='text-[11px] tracking-[0.28em] muted-2 mb-6'>
          BANGULNYANG
        </div>
        <h1 className='text-2xl font-bold tracking-tight mb-1 font-bangul'>
          가챠
        </h1>
        <p className='text-xs muted mb-6'>원하는 풀을 선택하세요.</p>

        <div className='space-y-3'>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className='rounded-2xl border border-[color:var(--border)] p-3'
            >
              <Skeleton className='aspect-[8/3] w-full rounded-xl mb-3' />
              <Skeleton className='h-4 w-3/4 mb-2' />
              <Skeleton className='h-3 w-1/2' />
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className='flex-1 flex flex-col items-center justify-center p-8'>
        <div className='w-full max-w-2xl space-y-6'>
          <Skeleton className='h-12 w-full rounded-2xl' />
          <Skeleton className='h-64 w-full rounded-2xl' />
          <div className='flex gap-4'>
            <Skeleton className='h-12 flex-1 rounded-xl' />
            <Skeleton className='h-12 flex-1 rounded-xl' />
          </div>
        </div>
      </div>
    </main>
  );
}
