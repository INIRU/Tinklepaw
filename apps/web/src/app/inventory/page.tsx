import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import InventoryClient from './ui';

export const runtime = 'nodejs';

export default async function InventoryPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) redirect('/login');

  const member = await fetchGuildMember({ userId });
  if (!member) redirect('/not-in-guild');

  return <InventoryClient />;
}
