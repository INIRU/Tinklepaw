import { requireGuildMember } from '@/lib/server/guards';

import ForgeClient from './ui';

export default async function ForgePage() {
  await requireGuildMember();
  return <ForgeClient />;
}
