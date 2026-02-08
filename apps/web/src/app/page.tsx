import Image from 'next/image';
import { redirect } from 'next/navigation';

import { auth } from '../../auth';
import { fetchGuildMember, isAdmin } from '@/lib/server/discord';
import Markdown from '@/components/content/Markdown';
import HomeActionGrid from '@/components/home/HomeActionGrid';
import { fetchPublicAppConfig } from '@/lib/server/app-config';
import Link from 'next/link';

export const runtime = 'nodejs';

export default async function Home() {
  const session = await auth();

  const cfg = await fetchPublicAppConfig();
  const intro = cfg.serverIntro;
  const bannerSrc = cfg.bannerImageUrl ?? '/banner.png';

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="sr-only">방울냥</h1>
        <div className="rounded-3xl card-glass p-3">
          <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)]">
            <Image src={bannerSrc} alt="동글동글 방울냥 배너" width={1600} height={600} className="h-auto w-full" priority />
          </div>
        </div>

        {intro ? (
          <section className="mt-4 rounded-3xl card-glass p-6">
            <h2 className="text-sm sm:text-lg font-semibold font-bangul">서버 소개</h2>
            <div className="mt-2.5">
              <Markdown content={intro} />
            </div>
          </section>
        ) : null}

        <HomeActionGrid />
      </main>
    );
  }

  const userId = session.user.id;
  const member = await fetchGuildMember({ userId });
  if (!member) redirect('/not-in-guild');

  const admin = await isAdmin({ userId, member });
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="sr-only">방울냥</h1>
      <div className="rounded-3xl card-glass p-3">
        <div className="relative overflow-hidden rounded-2xl border border-[color:var(--border)]">
          <Image src={bannerSrc} alt="동글동글 방울냥 배너" width={1600} height={600} className="h-auto w-full" priority />
        </div>
      </div>

      {intro ? (
        <section className="mt-4 rounded-3xl card-glass p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm sm:text-lg font-semibold font-bangul">서버 소개</h2>
            {admin ? (
              <Link className="rounded-full btn-soft px-2.5 py-1 text-[10px] sm:text-xs font-semibold" href="/admin/settings">
                수정
              </Link>
            ) : null}
          </div>
          <div className="mt-2.5">
            <Markdown content={intro} />
          </div>
        </section>
      ) : null}

      <HomeActionGrid />
    </main>
  );
}
