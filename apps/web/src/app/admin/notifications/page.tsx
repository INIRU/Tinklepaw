import { requireAdmin } from '@/lib/server/guards';

import { AdminNotificationPageClient } from './ui';

export default async function AdminNotificationPage() {
  await requireAdmin();

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <AdminNotificationPageClient />
    </div>
  );
}
