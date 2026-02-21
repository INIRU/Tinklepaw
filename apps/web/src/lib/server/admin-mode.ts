import 'server-only';

import { cookies } from 'next/headers';

export const ADMIN_MODE_COOKIE = 'nyaru_admin_mode';

export async function isAdminModeEnabled() {
  const store = await cookies();
  const raw = store.get(ADMIN_MODE_COOKIE)?.value;
  return raw !== 'off';
}
