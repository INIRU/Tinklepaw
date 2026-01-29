import { requireAdmin } from '@/lib/server/guards';

import SettingsClient from './ui';

export default async function AdminSettingsPage() {
  await requireAdmin();
  return <SettingsClient />;
}
