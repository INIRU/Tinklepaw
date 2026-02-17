import { Skeleton } from '@/components/ui/Skeleton';

export default function DrawLoading() {
  return (
    <main className='relative flex h-[calc(100vh-64px)] overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(255,149,200,0.18),transparent_58%)]'>
      {/* Left Sidebar - Pool List */}
      <aside className='z-10 hidden w-80 flex-shrink-0 overflow-y-auto border-r border-[color:var(--border)] bg-[color:var(--card)]/95 p-4 backdrop-blur md:block'>
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
              className='rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)]/45 p-3'
            >
              <Skeleton className='aspect-[8/3] w-full rounded-xl mb-3' />
              <Skeleton className='h-4 w-3/4 mb-2' />
              <Skeleton className='h-3 w-1/2' />
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className='flex flex-1 flex-col items-center justify-center p-6 sm:p-8'>
        <div className='w-full max-w-3xl space-y-5'>
          <div className='mx-auto flex w-fit items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)]/80 px-4 py-2 backdrop-blur'>
            <Skeleton className='h-3 w-8 rounded-full' />
            <Skeleton className='h-4 w-28 rounded-lg' />
          </div>

          <Skeleton className='h-[42vh] w-full rounded-[28px]' />

          <div className='rounded-[24px] border border-[color:var(--border)] bg-[color:var(--card)]/82 p-4 backdrop-blur'>
            <Skeleton className='mb-3 h-3 w-40 rounded-full' />
            <div className='grid grid-cols-2 gap-3'>
              <Skeleton className='h-14 rounded-2xl' />
              <Skeleton className='h-14 rounded-2xl' />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
