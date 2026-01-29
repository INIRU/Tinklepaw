import { fetchPublicAppConfig } from '@/lib/server/app-config';

import LoginClient from './ui';

export default async function LoginPage() {
  const cfg = await fetchPublicAppConfig();
  const bannerSrc = cfg.bannerImageUrl ?? '/banner.png';
  return <LoginClient bannerSrc={bannerSrc} />;
}
