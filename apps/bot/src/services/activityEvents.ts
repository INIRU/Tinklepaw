import type { Json } from '@nyaru/core';

import { getBotContext } from '../context.js';

export type ActivityEventType = 'member_join' | 'member_leave' | 'chat_message' | 'voice_seconds';

type ActivityEventInput = {
  guildId: string;
  userId: string | null;
  eventType: ActivityEventType;
  value?: number;
  meta?: Json;
};

const normalizeValue = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.floor(value));
};

export const recordActivityEvents = async (events: ActivityEventInput[]) => {
  if (events.length < 1) return;

  const ctx = getBotContext();
  const rows = events.map((event) => ({
    guild_id: event.guildId,
    user_id: event.userId,
    event_type: event.eventType,
    value: normalizeValue(event.value),
    meta: event.meta ?? {},
  }));

  const { error } = await ctx.supabase.from('activity_events').insert(rows);
  if (error) {
    console.warn('[ActivityEvents] Failed to insert activity events:', error);
  }
};

export const recordActivityEvent = async (event: ActivityEventInput) => {
  await recordActivityEvents([event]);
};
