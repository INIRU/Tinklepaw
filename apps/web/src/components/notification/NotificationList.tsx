'use client';

import { AnimatePresence } from 'framer-motion';
import { NotificationItem, Notification } from './NotificationItem';

interface NotificationListProps {
  notifications: Notification[];
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClaim?: (id: string) => void;
  emptyMessage?: string;
}

export function NotificationList({ notifications, onRead, onDelete, onClaim, emptyMessage = '알림이 없습니다.' }: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div className="py-12 text-center text-[color:var(--muted)] bg-[color:var(--card)] rounded-lg border border-dashed border-[color:var(--border)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        {notifications.map((notification) => (
          <NotificationItem 
            key={notification.id} 
            notification={notification} 
            onRead={onRead}
            onDelete={onDelete}
            onClaim={onClaim}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}