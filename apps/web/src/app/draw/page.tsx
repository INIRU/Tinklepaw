import { requireGuildMember } from '@/lib/server/guards';

import DrawClient from './ui';

export default async function DrawPage() {
  await requireGuildMember();
  return <DrawClient />;
}
