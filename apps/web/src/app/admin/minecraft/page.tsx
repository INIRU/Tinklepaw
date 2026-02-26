import { requireAdmin } from '@/lib/server/guards';
import MinecraftAdminClient from './ui';

export default async function AdminMinecraftPage() {
  await requireAdmin();
  return <MinecraftAdminClient />;
}
