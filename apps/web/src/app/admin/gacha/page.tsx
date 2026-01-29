import { requireAdmin } from '@/lib/server/guards';

import GachaAdminClient from './ui';

export default async function AdminGachaPage() {
  await requireAdmin();
  return <GachaAdminClient />;
}
