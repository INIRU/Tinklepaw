import 'server-only';

import { getServerEnv } from './env';

export type DiscordGuildMember = {
  user?: DiscordUser;
  nick?: string | null;
  roles: string[];
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

type DiscordRole = { id: string; name: string; permissions: string; managed: boolean };
type DiscordGuild = { id: string; owner_id: string };

const cache = {
  roles: null as { at: number; byId: Map<string, DiscordRole> } | null,
  guild: null as { at: number; data: DiscordGuild } | null,
  members: new Map<string, { at: number; data: DiscordGuildMember | null }>()
};

export async function fetchGuildMember(params: {
  userId: string;
}): Promise<DiscordGuildMember | null> {
  const now = Date.now();
  const cached = cache.members.get(params.userId);
  if (cached && now - cached.at < 60_000) {
    return cached.data;
  }

  const env = getServerEnv();
  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${params.userId}`, {
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
    },
    next: { revalidate: 30 }
  });

  if (res.status === 404) {
    cache.members.set(params.userId, { at: now, data: null });
    return null;
  }
  if (!res.ok) {
    throw new Error(`Discord member fetch failed: ${res.status}`);
  }
  
  const data = (await res.json()) as DiscordGuildMember;
  cache.members.set(params.userId, { at: now, data });
  return data;
}

export type DiscordMemberSearchResult = {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
};

function userAvatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}

export type DiscordUserSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export async function fetchMemberUserSummary(userId: string): Promise<DiscordUserSummary | null> {
  const member = await fetchGuildMember({ userId });
  if (!member?.user) return null;
  const name = member.nick ?? member.user.global_name ?? member.user.username;
  return {
    id: member.user.id,
    name,
    avatarUrl: userAvatarUrl(member.user)
  };
}

export async function searchGuildMembers(params: {
  query: string;
  limit?: number;
}): Promise<DiscordMemberSearchResult[]> {
  const env = getServerEnv();
  const q = params.query.trim();
  if (q.length < 2) return [];

  const limit = Math.max(1, Math.min(params.limit ?? 20, 50));
  const url = new URL(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/search`);
  url.searchParams.set('query', q);
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 10 }
  });

  if (!res.ok) throw new Error(`Discord member search failed: ${res.status}`);
  const members = (await res.json()) as Array<{ user: DiscordUser; nick?: string | null }>;

  return members
    .filter((m) => m.user && typeof m.user.id === 'string')
    .map((m) => ({
      id: m.user.id,
      username: m.user.username,
      globalName: m.user.global_name ?? null,
      nick: m.nick ?? null,
      avatarUrl: userAvatarUrl(m.user)
    }));
}

async function fetchGuild(): Promise<DiscordGuild> {
  const env = getServerEnv();
  const now = Date.now();
  if (cache.guild && now - cache.guild.at < 60_000) return cache.guild.data;

  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 300 }
  });
  if (!res.ok) throw new Error(`Discord guild fetch failed: ${res.status}`);
  const data = (await res.json()) as DiscordGuild;
  cache.guild = { at: now, data };
  return data;
}

async function fetchRolesById(): Promise<Map<string, DiscordRole>> {
  const env = getServerEnv();
  const now = Date.now();
  if (cache.roles && now - cache.roles.at < 60_000) return cache.roles.byId;

  const res = await fetch(`https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/roles`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    next: { revalidate: 60 }
  });
  if (!res.ok) throw new Error(`Discord roles fetch failed: ${res.status}`);
  const roles = (await res.json()) as DiscordRole[];
  const byId = new Map(roles.map((r) => [r.id, r] as const));
  cache.roles = { at: now, byId };
  return byId;
}

export async function isAdmin(params: { userId: string; member: DiscordGuildMember }): Promise<boolean> {
  const env = getServerEnv();
  const guild = await fetchGuild();
  if (params.userId === guild.owner_id) return true;

  const rolesById = await fetchRolesById();
  const roleIds = new Set<string>([env.NYARU_GUILD_ID, ...params.member.roles]);

  let perms = BigInt(0);
  for (const id of roleIds) {
    const role = rolesById.get(id);
    if (!role) continue;
    if (role.managed) continue;
    try {
      perms |= BigInt(role.permissions);
    } catch {
      // ignore
    }
  }

  const ADMINISTRATOR = BigInt(8);
  return (perms & ADMINISTRATOR) === ADMINISTRATOR;
}
