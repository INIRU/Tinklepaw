import { requireGuildMember } from '@/lib/server/guards';

import LottoClient from './ui';

export default async function LottoPage() {
  await requireGuildMember();
  return <LottoClient />;
}
