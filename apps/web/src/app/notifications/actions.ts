'use server';

import { createSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { revalidatePath } from 'next/cache';
import { auth } from '../../../auth';

export async function markAsRead(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: 'Unauthorized' };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('user_id', session.user.id);

  if (error) return { success: false, message: error.message };
  
  revalidatePath('/notifications');
  return { success: true };
}

export async function markAllAsRead() {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: 'Unauthorized' };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', session.user.id)
    .eq('is_read', false);

  if (error) return { success: false, message: error.message };
  
  revalidatePath('/notifications');
  return { success: true };
}

export async function deleteNotification(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: 'Unauthorized' };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', session.user.id);

  if (error) return { success: false, message: error.message };

  revalidatePath('/notifications');
  return { success: true };
}

export async function deleteAllRead() {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: 'Unauthorized' };

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', session.user.id)
    .eq('is_read', true);

  if (error) return { success: false, message: error.message };

  revalidatePath('/notifications');
  return { success: true };
}

export async function claimReward(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false, message: 'Unauthorized' };

  const supabase = createSupabaseAdminClient();
  
  // RPC 호출
  const { data, error } = await supabase.rpc('claim_notification_reward', {
    p_notification_id: id,
    p_user_id: session.user.id
  });

  if (error) return { success: false, message: error.message };

  revalidatePath('/notifications');
  // RPC 결과 반환
  return data as { success: boolean; message?: string };
}
