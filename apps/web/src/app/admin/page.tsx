import { requireAdmin } from '@/lib/server/guards';

import AdminDashboardClient from './ui';

export default async function AdminHome() {
  await requireAdmin();
  return <AdminDashboardClient />;
}
