import { requireAdmin } from '@/lib/server/guards';

import AdminAnalyticsClient from './ui';

export const runtime = 'nodejs';

export default async function AdminAnalyticsPage() {
  await requireAdmin();
  return <AdminAnalyticsClient />;
}
