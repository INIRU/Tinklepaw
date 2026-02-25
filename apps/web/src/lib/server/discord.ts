import 'server-only';

import { getServerEnv } from './env';

export type DiscordGuildMember = {
  user?: DiscordUser;
  nick?: string | null;
  roles: string[];
  premium_since?: string | null;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type DiscordRoleColors = {
  primary_color: number;
  secondary_color: number | null;
  tertiary_color: number | null;
};

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  colors?: DiscordRoleColors | null;
  position: number;
  permissions: string;
  managed: boolean;
  icon?: string | null;
  unicode_emoji?: string | null;
};
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
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Discord roles fetch failed: ${res.status}`);
  const roles = (await res.json()) as DiscordRole[];
  const byId = new Map(roles.map((r) => [r.id, r] as const));
  cache.roles = { at: now, byId };
  return byId;
}

function roleIconUrl(roleId: string, icon: string, size = 64): string {
  const ext = icon.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/role-icons/${roleId}/${icon}.${ext}?size=${size}`;
}

export async function fetchRoleIconMap(roleIds: string[]): Promise<Map<string, string | null>> {
  if (roleIds.length === 0) return new Map();
  const rolesById = await fetchRolesById();
  const map = new Map<string, string | null>();
  for (const id of roleIds) {
    const role = rolesById.get(id);
    map.set(id, role?.icon ? roleIconUrl(id, role.icon) : null);
  }
  return map;
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

// ── Personal-role helpers ───────────────────────────────────

export async function getRole(roleId: string): Promise<DiscordRole | null> {
  const byId = await fetchRolesById();
  return byId.get(roleId) ?? null;
}

export async function createGuildRole(params: {
  name: string;
  color?: number;
}): Promise<DiscordRole> {
  const env = getServerEnv();
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/roles`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: params.name,
        color: params.color ?? 0,
        permissions: '0',
        mentionable: false,
        hoist: false,
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord create-role failed (${res.status}) ${text}`);
  }
  // Invalidate cached roles
  cache.roles = null;
  return (await res.json()) as DiscordRole;
}

export async function modifyGuildRole(params: {
  roleId: string;
  name?: string;
  color?: number;
  colors?: DiscordRoleColors | null;
  icon?: string | null;
}): Promise<DiscordRole> {
  const env = getServerEnv();
  const body: Record<string, unknown> = {};
  if (params.name !== undefined) body.name = params.name;
  if (params.color !== undefined) body.color = params.color;
  if (params.colors !== undefined) body.colors = params.colors;
  if (params.icon !== undefined) body.icon = params.icon;

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/roles/${params.roleId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord modify-role failed (${res.status}) ${text}`);
  }
  cache.roles = null;
  return (await res.json()) as DiscordRole;
}

export async function moveRolePosition(params: {
  roleId: string;
  position: number;
}): Promise<void> {
  const env = getServerEnv();
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/roles`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ id: params.roleId, position: params.position }]),
    },
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord move-role failed (${res.status}) ${text}`);
  }
  cache.roles = null;
}

export async function addMemberRole(params: {
  userId: string;
  roleId: string;
}): Promise<void> {
  const env = getServerEnv();
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${env.NYARU_GUILD_ID}/members/${params.userId}/roles/${params.roleId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    },
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord add-member-role failed (${res.status}) ${text}`);
  }
}

export { roleIconUrl };
