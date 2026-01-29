import { requireAdmin } from '@/lib/server/guards';

import UsersAdminClient from './ui';

export default async function AdminUsersPage() {
  await requireAdmin();
  return <UsersAdminClient />;
}
