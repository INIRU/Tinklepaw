import Image from 'next/image';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { fetchGuildMember } from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import MeClient from './ui';

export const runtime = 'nodejs';

export default async function MePage() {
  const session = await auth();
  const userId = session?.user?.id;

  // Redirect to login if not logged in
  if (!userId) redirect('/login');

  const member = await fetchGuildMember({ userId });
  if (!member) redirect('/not-in-guild');

  const supabase = createSupabaseAdminClient();
  const { data: bal } = await supabase
    .from('point_balances')
    .select('balance')
    .eq('discord_user_id', userId)
    .maybeSingle();

  const user = {
    name: session.user.name ?? '사용자',
    imageUrl: session.user.image ?? null,
    points: bal?.balance ?? 0
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <MeClient user={user} fallbackAvatar={<div className="h-18 w-18 rounded-3xl border border-[color:var(--border)] bg-[color:var(--chip)]" />}>
        {user.imageUrl ? (
          <Image
            src={user.imageUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 rounded-3xl border border-[color:var(--border)]"
          />
        ) : null}
      </MeClient>
    </main>
  );
}
