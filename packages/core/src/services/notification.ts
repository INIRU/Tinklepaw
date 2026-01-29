import { supabase } from '../lib/supabase.js';
import { Database } from '../supabase.types.js';

export type Notification = Database['nyang']['Tables']['notifications']['Row'];
export type CreateNotificationParams = Database['nyang']['Tables']['notifications']['Insert'];

export class NotificationService {
  // 알림 생성
  static async createNotification(params: CreateNotificationParams): Promise<Notification> {
    const { data, error } = await supabase
      .from('notifications')
      .insert([params])
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error('Notification created but no data returned');
    return data;
  }

  // 특정 사용자의 알림 목록 조회
  static async getUserNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // 알림 읽음 처리
  static async markAsRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }

  // 알림 삭제
  static async deleteNotification(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
  }

  // 모든 알림 삭제
  static async deleteAllUserNotifications(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }

  // 읽지 않은 알림 수 조회
  static async getUnreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count || 0;
  }

  // 특정 사용자에게 알림 전송
  static async sendToUser(userId: string, params: Omit<CreateNotificationParams, 'user_id'>): Promise<Notification> {
    return this.createNotification({ user_id: userId, ...params });
  }

  // 여러 사용자에게 알림 전송
  static async sendToUsers(userIds: string[], params: Omit<CreateNotificationParams, 'user_id'>): Promise<Notification[]> {
    const notifications: Notification[] = [];
    
    for (const userId of userIds) {
      try {
        const notification = await this.sendToUser(userId, params);
        notifications.push(notification);
      } catch (error) {
        console.error(`Failed to send notification to user ${userId}:`, error);
      }
    }
    
    return notifications;
  }

  // 보상 수령
  static async claimReward(notificationId: string, userId: string): Promise<{ success: boolean; message?: string }> {
    const { data, error } = await supabase.rpc('claim_notification_reward', {
      p_notification_id: notificationId,
      p_user_id: userId
    });

    if (error) throw error;
    return data as { success: boolean; message?: string };
  }
}