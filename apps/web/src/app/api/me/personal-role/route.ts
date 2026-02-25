import { NextResponse } from 'next/server';

import { auth } from '../../../../../auth';
import {
  fetchGuildMember,
  getRole,
  createGuildRole,
  modifyGuildRole,
  addMemberRole,
  moveRolePosition,
  roleIconUrl,
  type DiscordRoleColors,
} from '@/lib/server/discord';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { getOrInitAppConfig } from '@/lib/server/app-config-admin';

export const runtime = 'nodejs';

type ColorType = 'solid' | 'gradient' | 'hologram';
const VALID_COLOR_TYPES = new Set<ColorType>(['solid', 'gradient', 'hologram']);

// Fixed holographic colours enforced by Discord
const HOLOGRAM_COLORS: DiscordRoleColors = {
  primary_color: 11127295,
  secondary_color: 16759788,
  tertiary_color: 16761760,
};

function buildDiscordColors(
  type: ColorType,
  primary: number,
  secondary: number,
): DiscordRoleColors | null {
  switch (type) {
    case 'gradient':
      return { primary_color: primary, secondary_color: secondary, tertiary_color: null };
    case 'hologram':
      return HOLOGRAM_COLORS;
    default:
      return null; // solid — use classic `color` field
  }
}

/** GET – Return the caller's personal-role info (or null). */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });

  const isBoosting = !!member.premium_since;

  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from('personal_roles')
    .select('discord_role_id, color_type, color_secondary')
    .eq('discord_user_id', userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ isBoosting, role: null });

  const role = await getRole(row.discord_role_id);
  if (!role) return NextResponse.json({ isBoosting, role: null });

  const iconUrl = role.icon ? roleIconUrl(role.id, role.icon) : null;
  return NextResponse.json({
    isBoosting,
    role: {
      id: role.id,
      name: role.name,
      color: role.color,
      colors: role.colors ?? null,
      colorType: row.color_type as ColorType,
      colorSecondary: row.color_secondary,
      iconUrl,
    },
  });
}

/** POST – Create a new personal role for a booster. */
export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  if (!member.premium_since) {
    return NextResponse.json({ error: '서버 부스터만 개인역할을 만들 수 있어요.' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase
    .from('personal_roles')
    .select('discord_role_id')
    .eq('discord_user_id', userId)
    .maybeSingle();

  if (existing) return NextResponse.json({ error: '이미 개인역할이 있어요.' }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    color?: number;
    colorType?: ColorType;
    colorSecondary?: number;
  };

  const name = (body.name ?? session.user.name ?? '개인역할').slice(0, 100);
  const primary = typeof body.color === 'number' ? body.color : 0;
  const colorType: ColorType =
    typeof body.colorType === 'string' && VALID_COLOR_TYPES.has(body.colorType as ColorType)
      ? (body.colorType as ColorType)
      : 'solid';
  const secondary = typeof body.colorSecondary === 'number' ? body.colorSecondary : 0;

  // Create the role
  const role = await createGuildRole({ name, color: primary });

  // Apply colors if gradient/hologram
  const discordColors = buildDiscordColors(colorType, primary, secondary);
  if (discordColors) {
    await modifyGuildRole({ roleId: role.id, colors: discordColors });
  }

  // Assign role to member
  await addMemberRole({ userId, roleId: role.id });

  // Position below anchor role if configured
  try {
    const cfg = await getOrInitAppConfig();
    const anchorId = (cfg as Record<string, unknown>).personal_role_anchor_id as string | null;
    if (anchorId) {
      const anchorRole = await getRole(anchorId);
      if (anchorRole) {
        await moveRolePosition({ roleId: role.id, position: anchorRole.position });
      }
    }
  } catch {
    // Non-fatal — role is created but position might not be set
  }

  // Store mapping in DB
  const { error: insertError } = await supabase.from('personal_roles').insert({
    discord_user_id: userId,
    discord_role_id: role.id,
    color_type: colorType,
    color_secondary: secondary,
  });

  if (insertError) {
    console.error('[PersonalRole] DB insert failed:', insertError);
    return NextResponse.json({ error: `DB 저장 실패: ${insertError.message}` }, { status: 500 });
  }

  const created = await getRole(role.id);
  const iconUrl = created?.icon ? roleIconUrl(created.id, created.icon) : null;

  return NextResponse.json({
    role: {
      id: role.id,
      name: created?.name ?? name,
      color: created?.color ?? primary,
      colors: created?.colors ?? null,
      colorType,
      colorSecondary: secondary,
      iconUrl,
    },
  });
}

/** PATCH – Update name / color / icon of the caller's personal role. */
export async function PATCH(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const member = await fetchGuildMember({ userId });
  if (!member) return NextResponse.json({ error: 'NOT_IN_GUILD' }, { status: 403 });
  if (!member.premium_since) {
    return NextResponse.json({ error: '서버 부스터만 개인역할을 수정할 수 있어요.' }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from('personal_roles')
    .select('discord_role_id, color_type, color_secondary')
    .eq('discord_user_id', userId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: '개인역할이 없어요. 먼저 만들어 주세요.' }, { status: 404 });

  const body = (await req.json()) as {
    name?: string;
    color?: number;
    icon?: string | null;
    colorType?: ColorType;
    colorSecondary?: number;
  };

  // ── Discord role update ──────────────────────────────
  const patch: Parameters<typeof modifyGuildRole>[0] = { roleId: row.discord_role_id };

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      return NextResponse.json({ error: '역할 이름은 1~100자여야 해요.' }, { status: 400 });
    }
    patch.name = trimmed;
  }

  if (typeof body.icon === 'string') {
    if (!body.icon.startsWith('data:image/png')) {
      return NextResponse.json({ error: 'PNG 이미지만 사용할 수 있어요.' }, { status: 400 });
    }
    if (body.icon.length > 90_000) {
      return NextResponse.json({ error: '이미지가 너무 커요 (최대 64KB).' }, { status: 400 });
    }
    patch.icon = body.icon;
  } else if (body.icon === null) {
    patch.icon = null;
  }

  // Resolve effective color type + colors
  const newColorType: ColorType =
    typeof body.colorType === 'string' && VALID_COLOR_TYPES.has(body.colorType as ColorType)
      ? (body.colorType as ColorType)
      : (row.color_type as ColorType);
  const newPrimary = typeof body.color === 'number' ? body.color : undefined;
  const newSecondary = typeof body.colorSecondary === 'number' ? body.colorSecondary : row.color_secondary;

  if (newPrimary !== undefined) {
    if (newPrimary < 0 || newPrimary > 0xffffff) {
      return NextResponse.json({ error: '유효하지 않은 색상이에요.' }, { status: 400 });
    }
    patch.color = newPrimary;
  }

  // Always set colors when color type changes
  if (body.colorType !== undefined || body.color !== undefined || body.colorSecondary !== undefined) {
    const effectivePrimary = newPrimary ?? (await getRole(row.discord_role_id))?.color ?? 0;
    patch.colors = buildDiscordColors(newColorType, effectivePrimary, newSecondary);
    // For solid, also ensure `color` is set
    if (newColorType === 'solid' && newPrimary !== undefined) {
      patch.color = newPrimary;
    }
  }

  const updated = await modifyGuildRole(patch);
  const iconUrl = updated.icon ? roleIconUrl(updated.id, updated.icon) : null;

  // ── DB metadata update ────────────────────────────────
  const dbPatch: Record<string, unknown> = {};
  if (body.colorType !== undefined) dbPatch.color_type = newColorType;
  if (body.colorSecondary !== undefined) {
    dbPatch.color_secondary = Math.max(0, Math.min(newSecondary, 0xffffff));
  }
  if (Object.keys(dbPatch).length > 0) {
    await supabase.from('personal_roles').update(dbPatch).eq('discord_user_id', userId);
  }

  return NextResponse.json({
    role: {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      colors: updated.colors ?? null,
      colorType: newColorType,
      colorSecondary: newSecondary,
      iconUrl,
    },
  });
}
