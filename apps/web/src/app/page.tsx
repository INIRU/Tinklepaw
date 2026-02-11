import { redirect } from 'next/navigation';

import { auth } from '../../auth';
import { fetchGuildMember, isAdmin } from '@/lib/server/discord';
import HomeStory from '@/components/home/HomeStory';
import { fetchPublicAppConfig } from '@/lib/server/app-config';

export const runtime = 'nodejs';

export default async function Home() {
  const session = await auth();

  const cfg = await fetchPublicAppConfig();
  const intro = cfg.serverIntro;
  const bannerSrc = cfg.bannerImageUrl ?? '/banner.png';

  if (!session?.user?.id) {
    return <HomeStory bannerSrc={bannerSrc} intro={intro} showAdminEdit={false} />;
  }

  const userId = session.user.id;
  let admin = Boolean(session.isAdmin);

  try {
    const member = await fetchGuildMember({ userId });
    if (!member) redirect('/not-in-guild');
    admin = await isAdmin({ userId, member });
  } catch (e) {
    if (process.env.NODE_ENV === 'production') {
      redirect('/support');
    }
    throw e;
  }

  return <HomeStory bannerSrc={bannerSrc} intro={intro} showAdminEdit={admin} />;
}
