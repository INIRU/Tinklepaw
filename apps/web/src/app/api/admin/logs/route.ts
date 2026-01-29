import { NextResponse } from 'next/server';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getServerEnv } from '@/lib/server/env';

export const runtime = 'nodejs';

type DiscordUser = {
  id: string;
  username: string;
  avatar: string | null;
  discriminator: string;
  global_name: string | null;
};

export async function GET() {
  const ctx = await requireAdminApi();
  if (isResponse(ctx)) return ctx;

  const env = getServerEnv();
  const supabase = createSupabaseAdminClient();
  
  const { data, error } = await supabase
    .from('point_events')
    .select('id, discord_user_id, kind, amount, created_at, meta')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch user info from Discord API
  const userIds = [...new Set(data.map(log => log.discord_user_id))];
  const userMap = new Map<string, DiscordUser | null>();

  if (env.DISCORD_BOT_TOKEN) {
    await Promise.all(userIds.map(async (id) => {
      try {
        const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
          headers: {
            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
          },
          next: { revalidate: 3600 } // Cache for 1 hour
        });
        
        if (res.ok) {
          const user = await res.json();
          userMap.set(id, user);
        } else {
          userMap.set(id, null);
        }
      } catch (e) {
        console.error(`Failed to fetch user ${id}`, e);
        userMap.set(id, null);
      }
    }));
  }

  const enrichedData = data.map(log => {
    const user = userMap.get(log.discord_user_id);
    return {
      ...log,
      users: {
        username: user ? (user.global_name || user.username) : 'Unknown User',
        avatar_url: user?.avatar 
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` 
          : null
      }
    };
  });

  return NextResponse.json(enrichedData);
}
