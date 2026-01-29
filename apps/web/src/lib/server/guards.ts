import 'server-only';

import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { fetchGuildMember, isAdmin } from './discord';

export async function requireUserSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  return session;
}

export async function requireGuildMember() {
  const session = await requireUserSession();
  let member = null as Awaited<ReturnType<typeof fetchGuildMember>>;
  try {
    member = await fetchGuildMember({ userId: session.user.id });
  } catch {
    redirect('/support');
  }
  if (!member) redirect('/not-in-guild');
  return { session, member };
}

export async function requireAdmin() {
  const { session, member } = await requireGuildMember();
  if (!(await isAdmin({ userId: session.user.id, member }))) redirect('/not-admin');
  return { session, member };
}
