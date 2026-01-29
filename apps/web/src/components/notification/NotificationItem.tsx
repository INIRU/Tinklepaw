'use client';

import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Info, AlertTriangle, CheckCircle, XCircle, Trash2, Check, Bell, Gift } from 'lucide-react';
import { m } from 'framer-motion';
import type { Database } from '@nyaru/core';

export type Notification = Database['nyang']['Tables']['notifications']['Row'];

interface NotificationItemProps {
  notification: Notification;
  onRead?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClaim?: (id: string) => void;
}

export function NotificationItem({ notification, onRead, onDelete, onClaim }: NotificationItemProps) {
  const typeConfig = {
    info: {
      style: 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20',
      iconColor: 'text-blue-500 dark:text-blue-400',
      badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      Icon: Info
    },
    warning: {
      style: 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20',
      iconColor: 'text-amber-500 dark:text-amber-400',
      badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      Icon: AlertTriangle
    },
    success: {
      style: 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      badgeColor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      Icon: CheckCircle
    },
    error: {
      style: 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-100 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20',
      iconColor: 'text-rose-500 dark:text-rose-400',
      badgeColor: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      Icon: XCircle
    }
  };

  const config = typeConfig[notification.type] || {
    style: 'bg-gray-50/50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
    iconColor: 'text-gray-500 dark:text-gray-400',
    badgeColor: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    Icon: Bell
  };
  const Icon = config.Icon;

  const hasReward = (notification.reward_points && notification.reward_points > 0) || 
                    (notification.reward_item_id && notification.reward_item_qty && notification.reward_item_qty > 0);

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className={`group relative p-5 rounded-2xl border transition-all duration-200 ${
        config.style
      } ${notification.is_read ? 'opacity-60 grayscale-[0.3]' : 'shadow-sm hover:shadow-md bg-white dark:bg-gray-800'}`}
    >
      <div className="flex gap-4">
        <div className={`mt-1 p-2.5 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm shadow-sm ${config.iconColor} ring-1 ring-inset ring-black/5 dark:ring-white/10`}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-2">
            <h3 className={`font-bold text-base md:text-lg tracking-tight ${notification.is_read ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
              {notification.title}
            </h3>
            <span className="text-xs text-gray-400 dark:text-gray-500 font-medium whitespace-nowrap ml-3 tabular-nums">
              {format(new Date(notification.created_at), 'PPP a p', { locale: ko })}
            </span>
          </div>
          
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {notification.content}
            </p>
          </div>

          {hasReward && (
            <div className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between gap-4 ${
              notification.is_reward_claimed 
                ? 'bg-gray-50/80 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800' 
                : 'bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${
                  notification.is_reward_claimed 
                    ? 'bg-gray-200 dark:bg-gray-800 text-gray-500' 
                    : 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400'
                }`}>
                  <Gift className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    notification.is_reward_claimed ? 'text-gray-500' : 'text-indigo-600 dark:text-indigo-400'
                  }`}>
                    보상 아이템
                  </span>
                  <span className={`text-sm font-medium ${
                    notification.is_reward_claimed ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {notification.reward_points ? `${notification.reward_points.toLocaleString()}P ` : ''}
                    {notification.reward_points && notification.reward_item_id ? '+ ' : ''}
                    {notification.reward_item_id ? `아이템 x${notification.reward_item_qty}` : ''}
                  </span>
                </div>
              </div>
              
              {onClaim && !notification.is_reward_claimed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim(notification.id);
                  }}
                  className="shrink-0 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 rounded-lg shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
                >
                  받기
                </button>
              )}
              
              {notification.is_reward_claimed && (
                <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  <Check className="w-3 h-3" /> 수령 완료
                </span>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
            {!notification.is_read && onRead && (
              <button
                onClick={() => onRead(notification.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                읽음 표시
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(notification.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                삭제
              </button>
            )}
          </div>
        </div>
      </div>
    </m.div>
  );
}