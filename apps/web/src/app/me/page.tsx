import Image from 'next/image';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { fetchGuildMember, getRole, roleIconUrl } from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';
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

  // Parallel: fetch balance + personal role mapping + app config
  const [balResult, prResult, appCfg] = await Promise.all([
    supabase
      .from('point_balances')
      .select('balance')
      .eq('discord_user_id', userId)
      .maybeSingle(),
    supabase
      .from('personal_roles')
      .select('discord_role_id, color_type, color_secondary')
      .eq('discord_user_id', userId)
      .maybeSingle(),
    getOrInitAppConfig(),
  ]);

  const grantedIds = (appCfg as Record<string, unknown>).personal_role_granted_user_ids as string[] | undefined;
  const isGranted = Array.isArray(grantedIds) && grantedIds.includes(userId);

  // Resolve personal role from Discord if mapping exists
  let personalRole: {
    id: string;
    name: string;
    color: number;
    colorType: 'solid' | 'gradient' | 'hologram';
    colorSecondary: number;
    iconUrl: string | null;
  } | null = null;

  if (prResult.data) {
    const role = await getRole(prResult.data.discord_role_id);
    if (role) {
      personalRole = {
        id: role.id,
        name: role.name,
        color: role.color,
        colorType: prResult.data.color_type as 'solid' | 'gradient' | 'hologram',
        colorSecondary: prResult.data.color_secondary,
        iconUrl: role.icon ? roleIconUrl(role.id, role.icon) : null,
      };
    }
  }

  const user = {
    name: session.user.name ?? '사용자',
    imageUrl: session.user.image ?? null,
    points: balResult.data?.balance ?? 0
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <MeClient
        user={user}
        isBoosting={!!member.premium_since}
        isGranted={isGranted}
        personalRole={personalRole}
        fallbackAvatar={<div className="h-18 w-18 rounded-3xl border border-[color:var(--border)] bg-[color:var(--chip)]" />}
      >
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
