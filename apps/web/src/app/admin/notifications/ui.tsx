'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Send,
  Plus,
  Loader2,
  Mail,
  Gift,
  Sparkles,
  X,
  CheckCircle,
  XCircle,
  Search,
} from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

type MemberHit = {
  id: string;
  username: string;
  globalName: string | null;
  nick: string | null;
  avatarUrl: string | null;
};

export function AdminNotificationPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [mounted, setMounted] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userHits, setUserHits] = useState<MemberHit[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MemberHit | null>(null);
  const userSearchAbortRef = useRef<AbortController | null>(null);
  const [formData, setFormData] = useState({
    target_user_id: '',
    title: '',
    content: '',
    type: 'info' as 'info' | 'warning' | 'success' | 'error',
    expires_in_days: 7,
    reward_points: '' as string | number,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // 사용자 검색
  useEffect(() => {
    const q = userQuery.trim();
    setSelectedUser(null);
    if (q.length < 2) {
      setUserHits([]);
      setUserSearching(false);
      userSearchAbortRef.current?.abort();
      userSearchAbortRef.current = null;
      return;
    }

    setUserSearching(true);
    const controller = new AbortController();
    userSearchAbortRef.current?.abort();
    userSearchAbortRef.current = controller;

    const t = window.setTimeout(() => {
      fetch(
        `/api/admin/discord/member-search?q=${encodeURIComponent(q)}&limit=25`,
        { signal: controller.signal },
      )
        .then((r) =>
          r.json().then((body) => ({ ok: r.ok, status: r.status, body })),
        )
        .then(({ ok, status, body }) => {
          if (!ok)
            throw new Error(
              (body as { error?: string } | null)?.error ?? `HTTP ${status}`,
            );
          const members = (
            (body as { members?: MemberHit[] } | null)?.members ?? []
          ).slice(0, 25);
          setUserHits(members);
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setUserHits([]);
        })
        .finally(() => {
          if (userSearchAbortRef.current === controller) {
            setUserSearching(false);
          }
        });
    }, 260);

    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [userQuery]);

  const displayUserName = useCallback(
    (m: MemberHit) => m.nick ?? m.globalName ?? m.username,
    [],
  );

  const handleUserSelect = useCallback(
    (user: MemberHit) => {
      setSelectedUser(user);
      setFormData((prev) => ({ ...prev, target_user_id: user.id }));
      setUserQuery(displayUserName(user));
      setUserHits([]);
    },
    [displayUserName],
  );

  const typeConfig = {
    info: {
      label: '정보',
      color: 'text-sky-500',
      bg: 'bg-sky-50 dark:bg-sky-900/20',
      border: 'border-sky-200 dark:border-sky-800',
    },
    success: {
      label: '성공',
      color: 'text-emerald-500',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    warning: {
      label: '경고',
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800',
    },
    error: {
      label: '오류',
      color: 'text-rose-500',
      bg: 'bg-rose-50 dark:bg-rose-900/20',
      border: 'border-rose-200 dark:border-rose-800',
    },
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          target_user_id: formData.target_user_id || undefined,
          reward_points:
            formData.reward_points === '' ? 0 : Number(formData.reward_points),
        }),
      });

      if (!res.ok) throw new Error('Failed to send');

      setShowSuccessModal(true);
      setFormData((prev) => ({
        ...prev,
        title: '',
        content: '',
        reward_points: '',
      }));
      setUserQuery('');
      setSelectedUser(null);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        '알림 전송 실패: ' +
          (error instanceof Error ? error.message : '알 수 없는 오류'),
      );
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const hasReward =
    formData.reward_points !== '' && formData.reward_points !== '0';

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-4'>
        <div className='p-2.5 rounded-xl bg-[color:var(--card)] border border-[color:var(--border)] shadow-sm'>
          <Mail className='w-5 h-5 text-[color:var(--accent-pink)]' />
        </div>
        <div>
          <h1 className='text-2xl md:text-3xl font-bold font-bangul tracking-tight'>
            알림 관리
          </h1>
          <p className='text-sm text-[color:var(--muted)] mt-0.5'>
            사용자에게 알림과 보상을 전송합니다
          </p>
        </div>
      </div>

      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className='card-glass rounded-2xl p-6 md:p-8'
      >
        <form onSubmit={handleSubmit} className='space-y-6'>
          {/* 알림 내용 섹션 */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2 mb-4'>
              <Sparkles className='w-4 h-4 text-[color:var(--accent-pink)]' />
              <h2 className='text-lg font-semibold font-bangul'>알림 내용</h2>
            </div>

            <div className='relative'>
              <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                대상 사용자
              </label>
              <div className='relative'>
                <div className='absolute left-3 top-1/2 -translate-y-1/2'>
                  <Search className='h-4 w-4 text-[color:var(--muted-2)]' />
                </div>
                <input
                  type='text'
                  value={userQuery}
                  onChange={(e) => {
                    const value = e.target.value;
                    setUserQuery(value);
                    if (!value) {
                      setSelectedUser(null);
                      setFormData((prev) => ({ ...prev, target_user_id: '' }));
                    } else {
                      // 숫자로만 이루어진 경우 Discord ID로 간주
                      if (/^\d+$/.test(value.trim())) {
                        setFormData((prev) => ({
                          ...prev,
                          target_user_id: value.trim(),
                        }));
                        setSelectedUser(null);
                      } else if (selectedUser) {
                        // 선택된 사용자가 있고 입력값이 변경되면 선택 해제
                        setSelectedUser(null);
                        setFormData((prev) => ({
                          ...prev,
                          target_user_id: '',
                        }));
                      }
                    }
                  }}
                  onFocus={() => {
                    if (
                      userQuery.trim().length >= 2 &&
                      !/^\d+$/.test(userQuery.trim())
                    ) {
                      setUserHits(userHits);
                    }
                  }}
                  className='w-full pl-10 pr-3 py-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/50 transition-all'
                  placeholder='사용자 이름으로 검색하거나 Discord User ID 입력'
                />
                {selectedUser && (
                  <button
                    type='button'
                    onClick={() => {
                      setSelectedUser(null);
                      setUserQuery('');
                      setFormData((prev) => ({ ...prev, target_user_id: '' }));
                    }}
                    className='absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[color:var(--chip)] transition-colors'
                  >
                    <X className='h-4 w-4 text-[color:var(--muted)]' />
                  </button>
                )}
              </div>
              {userHits.length > 0 && !selectedUser && (
                <div className='absolute z-10 w-full mt-1 bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl shadow-lg max-h-60 overflow-y-auto'>
                  {userHits.map((user) => (
                    <button
                      key={user.id}
                      type='button'
                      onClick={() => handleUserSelect(user)}
                      className='w-full flex items-center gap-3 px-4 py-3 hover:bg-[color:var(--chip)] transition-colors text-left'
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt=''
                          className='w-8 h-8 rounded-full'
                        />
                      ) : (
                        <div className='w-8 h-8 rounded-full bg-[color:var(--chip)]' />
                      )}
                      <div className='flex-1 min-w-0'>
                        <div className='text-sm font-medium text-[color:var(--fg)] truncate'>
                          {displayUserName(user)}
                        </div>
                        <div className='text-xs text-[color:var(--muted-2)] truncate'>
                          @{user.username}
                        </div>
                      </div>
                      <div className='text-xs text-[color:var(--muted-2)] font-mono'>
                        {user.id}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {userSearching && !selectedUser && (
                <div className='absolute z-10 w-full mt-1 bg-[color:var(--card)] border border-[color:var(--border)] rounded-xl shadow-lg p-4 text-center'>
                  <Loader2 className='h-5 w-5 animate-spin mx-auto text-[color:var(--muted)]' />
                </div>
              )}
              <p className='text-xs text-[color:var(--muted-2)] mt-1'>
                비워두면 전체 전송
              </p>
            </div>

            <div>
              <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                제목 <span className='text-rose-500'>*</span>
              </label>
              <input
                type='text'
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className='w-full p-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/50 transition-all'
                placeholder='알림 제목을 입력하세요'
                required
              />
            </div>

            <div>
              <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                내용 <span className='text-rose-500'>*</span>
              </label>
              <textarea
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                className='w-full p-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] placeholder:text-[color:var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/50 transition-all min-h-[120px]'
                placeholder='알림 내용을 입력하세요'
                required
              />
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
              <div>
                <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                  알림 타입
                </label>
                <div className='grid grid-cols-2 gap-2'>
                  {(
                    Object.entries(typeConfig) as [
                      keyof typeof typeConfig,
                      (typeof typeConfig)[keyof typeof typeConfig],
                    ][]
                  ).map(([key, config]) => (
                    <button
                      key={key}
                      type='button'
                      onClick={() => setFormData({ ...formData, type: key })}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        formData.type === key
                          ? `${config.bg} ${config.border} ${config.color} border-current`
                          : 'border-[color:var(--border)] text-[color:var(--muted)] hover:border-[color:var(--accent-pink)]/50'
                      }`}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                  만료일
                </label>
                <input
                  type='number'
                  value={formData.expires_in_days || ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({
                      ...formData,
                      expires_in_days: value === '' ? 7 : parseInt(value) || 7,
                    });
                  }}
                  className='w-full p-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/50 transition-all'
                  min='1'
                />
                <p className='text-xs text-[color:var(--muted-2)] mt-1'>
                  일 뒤 만료
                </p>
              </div>
            </div>
          </div>

          {/* 보상 섹션 */}
          <div className='border-t border-[color:var(--border)] pt-6'>
            <button
              type='button'
              onClick={() => setShowAdvanced(!showAdvanced)}
              className='w-full flex items-center justify-between p-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] hover:bg-[color:var(--accent-pink)]/5 transition-all'
            >
              <div className='flex items-center gap-3'>
                <Gift className='w-4 h-4 text-[color:var(--accent-lavender)]' />
                <span className='font-semibold text-sm'>보상 추가</span>
              </div>
              <Plus
                className={`w-4 h-4 text-[color:var(--muted)] transition-transform ${showAdvanced ? 'rotate-45' : ''}`}
              />
            </button>

            {showAdvanced && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className='pt-4 space-y-4'
              >
                <div>
                  <label className='block text-sm font-medium mb-2 text-[color:var(--muted)]'>
                    포인트 보상
                  </label>
                  <input
                    type='number'
                    value={formData.reward_points || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setFormData({
                        ...formData,
                        reward_points: value === '' ? '' : parseInt(value) || 0,
                      });
                    }}
                    className='w-full p-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-pink)]/50 transition-all'
                    min='0'
                    placeholder=''
                  />
                </div>

                {hasReward && (
                  <div className='p-4 rounded-xl bg-[color:var(--accent-mint)]/10 border border-[color:var(--accent-mint)]/30'>
                    <p className='text-sm text-[color:var(--accent-mint)] font-medium'>
                      💰 보상이 포함된 알림입니다
                    </p>
                  </div>
                )}
              </m.div>
            )}
          </div>

          {/* 전송 버튼 */}
          <button
            type='submit'
            disabled={loading}
            className='w-full btn-bangul py-3.5 rounded-xl font-semibold text-[color:var(--fg)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
          >
            {loading ? (
              <>
                <Loader2 className='w-4 h-4 animate-spin' />
                전송 중...
              </>
            ) : (
              <>
                <Send className='w-4 h-4' />
                알림 전송
              </>
            )}
          </button>
        </form>
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
                    알림 전송 완료!
                  </h2>
                  <p className='text-sm text-[color:var(--muted)] leading-relaxed mb-8'>
                    알림이 성공적으로 전송되었습니다.
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
                    알림 전송 실패
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
    </div>
  );
}
