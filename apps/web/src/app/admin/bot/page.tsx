import { requireAdmin } from '@/lib/server/guards';
import BotSettingsClient from './ui';

export const runtime = 'nodejs';

export default async function BotSettingsPage() {
  await requireAdmin();
  return <BotSettingsClient />;
}
