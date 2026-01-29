import { auth } from '../../../../../../auth';
import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Database } from '@nyaru/core';

type NotificationInsert = Database['nyang']['Tables']['notifications']['Insert'];

const sendNotificationSchema = z.object({
  target_user_id: z.string().optional(),
  title: z.string().min(1),
  content: z.string().min(1),
  type: z.enum(['info', 'warning', 'success', 'error']),
  expires_in_days: z.number().optional(),
  reward_points: z.number().optional(),
  reward_item_id: z.string().optional(),
  reward_item_qty: z.number().optional()
});

export async function POST(req: Request) {
  console.log('[Notification API] Start processing request');
  const session = await auth();
  
  // TODO: 실제 관리자 권한 체크 로직 필요 (현재는 로그인만 체크)
  if (!session?.user?.id) {
    console.log('[Notification API] Unauthorized: No session');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const json = await req.json();
    console.log('[Notification API] Payload:', JSON.stringify(json, null, 2));
    const body = sendNotificationSchema.parse(json);
    const supabase = createSupabaseAdminClient();

    let expires_at;
    if (body.expires_in_days) {
      const date = new Date();
      date.setDate(date.getDate() + body.expires_in_days);
      expires_at = date.toISOString();
    }

    const notificationData = {
      title: body.title,
      content: body.content,
      type: body.type,
      expires_at,
      reward_points: body.reward_points || 0,
      reward_item_id: body.reward_item_id || null,
      reward_item_qty: body.reward_item_qty || 0
    };

    if (body.target_user_id) {
      console.log('[Notification API] Sending to single user:', body.target_user_id);
      const insertData: NotificationInsert = {
        user_id: body.target_user_id,
        ...notificationData
      };
      const { error } = await supabase.from('notifications').insert(insertData);
      
      if (error) {
        console.error('[Notification API] Insert error:', error);
        throw error;
      }
    } else {
      console.log('[Notification API] Sending to all users');
      const { data: users, error: userError } = await supabase.from('users').select('discord_user_id');
      if (userError) {
        console.error('[Notification API] Fetch users error:', userError);
        throw userError;
      }

      if (users && users.length > 0) {
        console.log(`[Notification API] Found ${users.length} users`);
        const notifications: NotificationInsert[] = users.map(user => ({
          user_id: user.discord_user_id,
          ...notificationData
        }));
        
        const batchSize = 100;
        for (let i = 0; i < notifications.length; i += batchSize) {
          const batch = notifications.slice(i, i + batchSize);
          const { error } = await supabase.from('notifications').insert(batch);
          if (error) console.error('[Notification API] Batch insert error:', error);
        }
      } else {
        console.log('[Notification API] No users found');
      }
    }

    console.log('[Notification API] Success');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notification API] Failed to send notification:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}