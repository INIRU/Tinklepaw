import { requireGuildMember } from '@/lib/server/guards';

import MusicControlClient from './ui';

export const runtime = 'nodejs';

export default async function MusicControlPage() {
  await requireGuildMember();
  return <MusicControlClient />;
}
