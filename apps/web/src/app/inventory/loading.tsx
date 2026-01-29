import { Skeleton } from '@/components/ui/Skeleton';

export default function InventoryLoading() {
  return (
    <main className='min-h-screen pb-20 bg-bangul'>
      <div className='mx-auto max-w-6xl px-4 py-8 sm:px-6'>
        <div className='mb-8'>
          <div className='text-[11px] tracking-[0.28em] muted-2'>
            BANGULNYANG
          </div>
          <h1 className='mt-3 text-3xl font-semibold tracking-tight font-bangul'>
            인벤토리
          </h1>
          <p className='mt-1 text-sm muted'>
            보유 중인 아이템과 장착 상태를 확인하세요.
          </p>
        </div>

        <div className='mb-6 rounded-3xl card-glass p-6 relative overflow-hidden'>
          <Skeleton className='h-20 w-full rounded-2xl' />
        </div>

        <div className='space-y-8'>
          <section>
            <Skeleton className='h-6 w-32 mb-4' />
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className='h-48 rounded-[32px]' />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
