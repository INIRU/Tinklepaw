import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { Database } from '@nyaru/core';

import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { isResponse, requireAdminApi } from '@/lib/server/guards-api';

type NotificationInsert = Database['nyang']['Tables']['notifications']['Insert'];

const discordIdSchema = z
  .string()
  .regex(/^\d{17,20}$/, 'Invalid Discord user ID format');

const sendNotificationSchema = z.object({
  target_user_id: discordIdSchema.optional(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(2000),
  type: z.enum(['info', 'warning', 'success', 'error']),
  expires_in_days: z.number().int().min(1).max(365).optional(),
  reward_points: z.number().int().min(0).max(1_000_000).optional(),
  reward_item_id: z.string().trim().min(1).max(128).optional(),
  reward_item_qty: z.number().int().min(1).max(999).optional(),
}).superRefine((value, ctx) => {
  if (!value.reward_item_id && value.reward_item_qty !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['reward_item_qty'],
      message: 'reward_item_qty requires reward_item_id',
    });
  }
});

export async function POST(req: Request) {
  const admin = await requireAdminApi();
  if (isResponse(admin)) return admin;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const parsed = sendNotificationSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_BODY', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const supabase = createSupabaseAdminClient();

  const expires_at = body.expires_in_days
    ? (() => {
        const date = new Date();
        date.setDate(date.getDate() + body.expires_in_days);
        return date.toISOString();
      })()
    : null;

  const notificationBase = {
    title: body.title,
    content: body.content,
    type: body.type,
    expires_at,
    reward_points: body.reward_points ?? 0,
    reward_item_id: body.reward_item_id ?? null,
    reward_item_qty: body.reward_item_qty ?? 0,
  };

  try {
    if (body.target_user_id) {
      const insertData: NotificationInsert = {
        user_id: body.target_user_id,
        ...notificationBase,
      };

      const { error } = await supabase.from('notifications').insert(insertData);

      if (error) {
        console.error('[notifications/send] single insert failed', error);
        return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
      }

      return NextResponse.json({ success: true, sent: 1 });
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('discord_user_id')
      .not('discord_user_id', 'is', null);

    if (usersError) {
      console.error('[notifications/send] user query failed', usersError);
      return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
    }

    const userIds = Array.from(
      new Set(
        (users ?? [])
          .map((user) => user.discord_user_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );

    if (userIds.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const notifications: NotificationInsert[] = userIds.map((userId) => ({
      user_id: userId,
      ...notificationBase,
    }));

    const batchSize = 100;
    let sent = 0;

    for (let i = 0; i < notifications.length; i += batchSize) {
      const batch = notifications.slice(i, i + batchSize);
      const { error } = await supabase.from('notifications').insert(batch);
      if (error) {
        console.error('[notifications/send] batch insert failed', { at: i, error });
        return NextResponse.json({ error: 'DB_ERROR' }, { status: 500 });
      }
      sent += batch.length;
    }

    return NextResponse.json({ success: true, sent });
  } catch (error) {
    console.error('[notifications/send] unexpected error', error);
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}
