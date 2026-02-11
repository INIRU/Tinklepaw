import { requireGuildMember } from '@/lib/server/guards';

import StockClient from './ui';

export default async function StockPage() {
  await requireGuildMember();
  return <StockClient />;
}
