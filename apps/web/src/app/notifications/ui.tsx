'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  RefreshCw,
  Trash2,
  Check,
  Gift,
  Inbox,
  Info,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
} from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { NotificationList } from '../../components/notification/NotificationList';
import { Notification } from '../../components/notification/NotificationItem';
import { markAsRead, deleteNotification, claimReward, markAllAsRead, deleteAllRead } from './actions';

export function NotificationClientPage({
  initialNotifications,
  userId,
}: {
  initialNotifications: Notification[];
  userId: string;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'unread'>('all');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch('/api/notifications/unread');
      const data = await res.json();
      setUnreadCount(data.count || 0);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
  }, [notifications]);

  const handleRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    const result = await markAsRead(id);
    if (!result.success) {
      console.error('Failed to read:', result.message);
    }
  };

  const handleDelete = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const result = await deleteNotification(id);
    if (!result.success) {
      console.error('Failed to delete:', result.message);
    }
  };

  const handleClaim = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_reward_claimed: true, is_read: true } : n,
      ),
    );

    const result = await claimReward(id);

    if (!result || !result.success) {
      console.error('Failed to claim reward:', result?.message);
      setErrorMessage(
        '보상 수령에 실패했습니다: ' + (result?.message || '알 수 없는 오류'),
      );
      setShowErrorModal(true);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_reward_claimed: false } : n)),
      );
    } else {
      setShowSuccessModal(true);
    }
  };

  const handleMarkAllAsRead = async () => {
    setIsLoading(true);
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    
    const result = await markAllAsRead();
    if (!result.success) {
      console.error('Failed to mark all as read:', result.message);
      // Revert if failed (optional, but good practice)
      await fetchUnreadCount(); // Refresh actual state
    }
    setIsLoading(false);
  };

  const handleClearAll = () => {
    setShowConfirmModal(true);
  };

  const confirmClearAll = async () => {
    setShowConfirmModal(false);
    // Optimistic update
    setNotifications(prev => prev.filter(n => !n.is_read));
    
    const result = await deleteAllRead();
    if (!result.success) {
      console.error('Failed to delete all read:', result.message);
      // Refresh
      // We would need to refetch everything here ideally
    }
  };

  const filteredNotifications =
    viewMode === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  const unreadNotificationsCount = notifications.filter(
    (n) => !n.is_read,
  ).length;

  const getNotificationIcon = (notification: Notification) => {
    if (notification.is_reward_claimed) {
      return {
        Icon: Check,
        color: 'text-[color:var(--muted-2)]',
        bg: 'bg-[color:var(--muted-2)]/10',
      };
    }

    switch (notification.type) {
      case 'info':
        return { Icon: Info, color: 'text-sky-500', bg: 'bg-sky-500/10' };
      case 'success':
        return {
          Icon: CheckCircle,
          color: 'text-emerald-500',
          bg: 'bg-emerald-500/10',
        };
      case 'warning':
        return {
          Icon: AlertTriangle,
          color: 'text-amber-500',
          bg: 'bg-amber-500/10',
        };
      case 'error':
        return { Icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' };
      default:
        return {
          Icon: Bell,
          color: 'text-[color:var(--accent-pink)]',
          bg: 'bg-[color:var(--accent-pink)]/10',
        };
    }
  };

  return (
    <div className='space-y-6'>
      {/* 헤더 섹션 */}
      <div className='relative overflow-hidden rounded-3xl card-glass p-6 md:p-8'>
        <div className='relative'>
          <div className='flex items-start justify-between gap-6'>
            <div className='flex items-center gap-4'>
              <div className='relative'>
                <div className='absolute -inset-1 bg-gradient-to-br from-[color:var(--accent-pink)] to-[color:var(--accent-lavender)] rounded-2xl blur-md opacity-20 animate-pulse-slow' />
                <div className='relative p-3 rounded-2xl bg-[color:var(--chip)] border border-[color:var(--border)] shadow-lg'>
                  <Inbox
                    className='w-7 h-7 text-[color:var(--accent-pink)]'
                    strokeWidth={1.5}
                  />
                </div>
              </div>
              <div>
                <h1 className='text-3xl md:text-4xl font-bold font-bangul tracking-tight'>
                  알림
                </h1>
                <p className='text-base text-[color:var(--muted)] mt-1'>
                  {unreadCount > 0
                    ? `${unreadCount}개의 새로운 알림이 있어요!`
                    : '새로운 알림이 없어요'}
                </p>
              </div>
            </div>

            <div className='flex items-center gap-2'>
              <div className='flex rounded-full border border-[color:var(--border)] bg-[color:var(--card)] p-1'>
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    viewMode === 'all'
                      ? 'bg-[color:var(--accent-pink)] text-white shadow-lg'
                      : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => setViewMode('unread')}
                  className={`px-4 py-2 rounded-full text-sm font-semibold transition-all relative ${
                    viewMode === 'unread'
                      ? 'bg-[color:var(--accent-pink)] text-white shadow-lg'
                      : 'text-[color:var(--muted)] hover:text-[color:var(--fg)]'
                  }`}
                >
                  안읽음
                  {unreadNotificationsCount > 0 && (
                    <span className='absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white'>
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className='mt-6 flex flex-wrap items-center gap-3'>
            {unreadCount > 0 && (
              <m.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleMarkAllAsRead}
                disabled={isLoading}
                className='btn-bangul px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2'
              >
                <Check className='w-4 h-4' />
                모두 읽음 표시
              </m.button>
            )}
            <m.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleClearAll}
              className='btn-soft px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2'
            >
              <Trash2 className='w-4 h-4' />
              읽은 알림 삭제
            </m.button>
          </div>
        </div>
      </div>

      {/* 알림 리스트 */}
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className='space-y-4'
      >
        {filteredNotifications.length === 0 ? (
          <m.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className='text-center py-16 px-8'
          >
            <div className='inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[color:var(--accent-pink)]/10 to-[color:var(--accent-lavender)]/5 border border-[color:var(--border)]'>
              <Bell
                className='w-10 h-10 text-[color:var(--accent-pink)]/50'
                strokeWidth={1}
              />
            </div>
            <p className='mt-6 text-lg text-[color:var(--muted)]'>
              {viewMode === 'unread'
                ? '읽지 않은 알림이 없어요'
                : '아직 알림이 없어요'}
            </p>
            <p className='text-sm text-[color:var(--muted-2)] mt-2'>
              첫 알림이 도착하면 여기에 표시될 거예요
            </p>
          </m.div>
        ) : (
          <AnimatePresence mode='popLayout'>
            {filteredNotifications.map((notification, index) => (
              <m.div
                key={notification.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25, delay: index * 0.05 }}
              >
                <div className='card-glass rounded-2xl p-5 hover:shadow-xl transition-shadow'>
                  <div className='flex gap-4'>
                    <div
                      className={`p-1.5 rounded-xl w-10 h-10 flex justify-center items-center ${
                        notification.is_reward_claimed
                          ? 'bg-[color:var(--muted-2)]/20'
                          : notification.type === 'info'
                            ? 'bg-sky-500/10'
                            : notification.type === 'success'
                              ? 'bg-emerald-500/10'
                              : notification.type === 'warning'
                                ? 'bg-amber-500/10'
                                : 'bg-rose-500/10'
                      }`}
                    >
                      {(() => {
                        const { Icon } = getNotificationIcon(notification);
                        return (
                          <Icon
                            className={`w-5 h-5 ${getNotificationIcon(notification).color}`}
                            strokeWidth={1.5}
                          />
                        );
                      })()}
                    </div>

                    <div className='flex-1 min-w-0'>
                      <div className='flex justify-between items-start gap-4'>
                        <h3
                          className={`font-bold text-lg md:text-xl ${
                            notification.is_read
                              ? 'text-[color:var(--muted-2)]'
                              : 'text-[color:var(--fg)]'
                          }`}
                        >
                          {notification.title}
                        </h3>
                        <div className='flex items-center gap-2'>
                          <span className='text-xs text-[color:var(--muted-2)]'>
                            {new Date(
                              notification.created_at,
                            ).toLocaleDateString('ko-KR', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {!notification.is_read && (
                            <span className='px-2 py-0.5 rounded-full bg-[color:var(--accent-pink)] text-[10px] font-bold text-white'>
                              NEW
                            </span>
                          )}
                        </div>
                      </div>

                      <p
                        className={`mt-2 text-sm leading-relaxed ${
                          notification.is_read
                            ? 'text-[color:var(--muted-2)]'
                            : 'text-[color:var(--fg)]'
                        }`}
                      >
                        {notification.content}
                      </p>

                      {notification.reward_points &&
                        notification.reward_points > 0 && (
                          <div
                            className={`mt-4 p-4 rounded-xl border flex items-center justify-between gap-4 ${
                              notification.is_reward_claimed
                                ? 'bg-[color:var(--chip)] border-[color:var(--border)] opacity-60'
                                : 'bg-gradient-to-r from-[color:var(--accent-mint)]/10 to-[color:var(--accent-sky)]/5 border-[color:var(--accent-mint)]/30'
                            }`}
                          >
                            <div className='flex items-center justify-between gap-6 flex-1'>
                              <div className='flex items-center gap-3'>
                                <div
                                  className={`p-2 rounded-lg ${
                                    notification.is_reward_claimed
                                      ? 'bg-[color:var(--muted-2)]/20'
                                      : 'bg-[color:var(--accent-mint)]/20'
                                  }`}
                                >
                                  <Gift
                                    className={`w-5 h-5 ${
                                      notification.is_reward_claimed
                                        ? 'text-[color:var(--muted-2)]'
                                        : 'text-[color:var(--accent-mint)]'
                                    }`}
                                    strokeWidth={1.5}
                                  />
                                </div>
                                <div>
                                  <p className='text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]'>
                                    포인트 보상
                                  </p>
                                  <p
                                    className={`text-sm font-bold ${
                                      notification.is_reward_claimed
                                        ? 'text-[color:var(--muted-2)]'
                                        : 'text-[color:var(--fg)]'
                                    }`}
                                  >
                                    {notification.reward_points.toLocaleString()}
                                    P
                                  </p>
                                </div>
                              </div>

                              {notification.is_reward_claimed ? (
                                <span className='flex items-center gap-1.5 text-xs font-medium text-[color:var(--muted-2)] bg-[color:var(--chip)] px-3 py-1.5 rounded-lg'>
                                  <Check className='w-3.5 h-3.5' />
                                  수령 완료
                                </span>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleClaim(notification.id);
                                  }}
                                  className='btn-bangul px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 flex items-center gap-1.5'
                                >
                                  <Gift className='w-4 h-4' />
                                  받기
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                      <div className='mt-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                        {!notification.is_read && (
                          <button
                            onClick={() => handleRead(notification.id)}
                            className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[color:var(--accent-emerald)] hover:bg-[color:var(--accent-emerald)]/10 rounded-lg transition-colors'
                          >
                            <Check className='w-3.5 h-3.5' />
                            읽음 표시
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className='flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[color:var(--muted)] hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors'
                        >
                          <Trash2 className='w-3.5 h-3.5' />
                          삭제
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </m.div>
            ))}
          </AnimatePresence>
        )}
      </m.div>

      {/* 성공 모달 */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {showSuccessModal && (
              <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
                <m.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-[32px] p-8 shadow-2xl text-center'
                >
                  <button
                    onClick={() => setShowSuccessModal(false)}
                    className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                  >
                    <X className='w-5 h-5 text-[color:var(--muted)]' />
                  </button>

                  <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.15)]'>
                    <CheckCircle className='h-10 w-10' strokeWidth={1.5} />
                  </div>

                  <h2 className='text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2'>
                    보상 수령 완료!
                  </h2>
                  <p className='text-sm text-[color:var(--muted)] leading-relaxed mb-8'>
                    보상을 성공적으로 수령했습니다.
                  </p>

                  <m.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowSuccessModal(false)}
                    className='w-full rounded-2xl btn-bangul px-5 py-4 text-sm font-bold shadow-lg'
                  >
                    확인
                  </m.button>
                </m.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* 에러 모달 */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {showErrorModal && (
              <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
                <m.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-[32px] p-8 shadow-2xl text-center'
                >
                  <button
                    onClick={() => setShowErrorModal(false)}
                    className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                  >
                    <X className='w-5 h-5 text-[color:var(--muted)]' />
                  </button>

                  <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.15)]'>
                    <XCircle className='h-10 w-10' strokeWidth={1.5} />
                  </div>

                  <h2 className='text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2'>
                    보상 수령 실패
                  </h2>
                  <p className='text-sm text-[color:var(--muted)] leading-relaxed mb-8'>
                    {errorMessage}
                  </p>

                  <m.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowErrorModal(false)}
                    className='w-full rounded-2xl btn-bangul px-5 py-4 text-sm font-bold shadow-lg'
                  >
                    확인
                  </m.button>
                </m.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      {/* 확인 모달 */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {showConfirmModal && (
              <div className='fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm'>
                <m.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className='relative max-w-sm w-full bg-[color:var(--card)] border border-[color:var(--border)] rounded-[32px] p-8 shadow-2xl text-center'
                >
                  <button
                    onClick={() => setShowConfirmModal(false)}
                    className='absolute top-4 right-4 p-2 rounded-full hover:bg-[color:var(--chip)] transition-colors cursor-pointer'
                  >
                    <X className='w-5 h-5 text-[color:var(--muted)]' />
                  </button>

                  <div className='mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.15)]'>
                    <AlertTriangle className='h-10 w-10' strokeWidth={1.5} />
                  </div>

                  <h2 className='text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2'>
                    알림 삭제 확인
                  </h2>
                  <p className='text-sm text-[color:var(--muted)] leading-relaxed mb-8'>
                    모든 알림을 삭제하시겠습니까?
                    <br />이 작업은 되돌릴 수 없습니다.
                  </p>

                  <div className='flex flex-col gap-3'>
                    <m.button
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={confirmClearAll}
                      className='w-full rounded-2xl btn-bangul px-5 py-4 text-sm font-bold shadow-lg'
                    >
                      삭제하기
                    </m.button>
                    <m.button
                      whileHover={{ opacity: 0.8 }}
                      onClick={() => setShowConfirmModal(false)}
                      className='w-full rounded-2xl border border-[color:var(--border)] hover:bg-[color:var(--chip)] px-5 py-4 text-sm font-semibold transition-colors'
                    >
                      취소
                    </m.button>
                  </div>
                </m.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
