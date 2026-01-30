"use client";

import { m, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Menu, X as CloseIcon, LogOut, Package, Dices, MessageCircle, Settings, User, Bell, Music } from 'lucide-react';
import { signOut } from 'next-auth/react';

import DiscordMark from '@/components/icons/DiscordMark';
import ThemeToggle from '@/components/theme/ThemeToggle';

type UserView = {
  name: string;
  imageUrl: string | null;
};

export default function MainNav(props: {
  user: UserView | null;
  showAdmin?: boolean;
  iconUrl?: string | null;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const inviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? 'https://discord.gg/tinklepaw';
  const iconSrc = props.iconUrl ?? '/icon.jpg';

  useEffect(() => {
    if (props.user) {
      fetch('/api/notifications/unread')
        .then(res => res.json())
        .then(data => setUnreadCount(data.count))
        .catch(console.error);
    }
  }, [props.user]);

  const navLinks = [
    { label: '뽑기', href: '/draw', icon: Dices },
    { label: '인벤토리', href: '/inventory', icon: Package },
    { label: '음악', href: '/music', icon: Music },
    { label: '알림', href: '/notifications', icon: Bell, badge: unreadCount > 0 },
    { label: '문의', href: '/support', icon: MessageCircle },
    ...(props.showAdmin ? [{ label: '관리자', href: '/admin', icon: Settings }] : [])
  ];

  return (
    <nav>
      <m.div
        className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--bg)]/70 backdrop-blur"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] shadow-sm">
                <Image src={iconSrc} alt="" width={28} height={28} className="h-7 w-7 rounded-xl" priority />
              </span>
              <div className="leading-tight">
                <div className="text-[10px] tracking-[0.26em] muted-2">BANGULNYANG</div>
                <div className="text-sm font-semibold font-bangul text-[color:var(--fg)]">방울냥</div>
              </div>
            </Link>

            <div className="ml-3 hidden items-center gap-1 lg:flex">
              {navLinks.filter(link => link.href !== '/notifications').map((link) => (
                <Link
                  key={link.href}
                  className="rounded-full btn-soft px-3 py-1.5 text-xs font-semibold"
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <m.a
              href={inviteUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-full btn-soft px-4 py-2 text-xs font-semibold sm:inline-flex"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            >
              서버 초대
            </m.a>

            <ThemeToggle />

            {props.user && (
              <div className="hidden lg:flex items-center">
                <Link
                  href="/notifications"
                  className="relative flex items-center justify-center h-9 w-9 rounded-full btn-soft mr-2"
                  aria-label="알림"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                  )}
                </Link>
              </div>
            )}

            {props.user ? (
              <div className="hidden items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--chip)] px-2 py-1.5 shadow-sm sm:flex">
                {props.user.imageUrl ? (
                  <Image
                    src={props.user.imageUrl}
                    alt={`${props.user.name}의 프로필 이미지`}
                    width={28}
                    height={28}
                    className="h-7 w-7 rounded-full border border-[color:var(--border)]"
                  />
                ) : (
                  <div className="h-7 w-7 rounded-full border border-[color:var(--border)] bg-white/60" />
                )}
                <div className="max-w-[7rem] truncate text-xs font-semibold text-[color:var(--fg)]">{props.user.name}</div>
                <Link className="rounded-full btn-soft px-2 py-1 text-[11px]" href="/me">
                  정보
                </Link>
                <button
                  className="rounded-full btn-soft px-2 py-1 text-[11px] cursor-pointer hover:text-red-400 transition-colors"
                  onClick={() => void signOut({ callbackUrl: '/' })}
                  aria-label="로그아웃"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <m.div
                className="hidden sm:block"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              >
                <Link
                  className="inline-flex h-9 items-center justify-center rounded-full btn-discord px-4 text-xs font-semibold leading-none"
                  href="/login"
                >
                  <DiscordMark className="h-4 w-4 mr-2" />
                  <span>Discord 로그인</span>
                </Link>
              </m.div>
            )}

            <button
              className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)] text-[color:var(--fg)] lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            >
              {isMenuOpen ? <CloseIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              {unreadCount > 0 && !isMenuOpen && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
              )}
            </button>
          </div>
        </div>
      </m.div>

      <AnimatePresence>
        {isMenuOpen && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-x-0 top-[61px] z-20 border-b border-[color:var(--border)] bg-[color:var(--bg)]/95 p-4 backdrop-blur-lg md:hidden"
          >
            <div className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[color:var(--fg)] hover:bg-[color:var(--chip)] hover:border-[color:var(--border)] transition-all relative"
                >
                  <link.icon className="h-5 w-5 text-[color:var(--muted)]" />
                  {link.label}
                  {link.badge && (
                    <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </Link>
              ))}

              <div className="my-2 h-px bg-[color:var(--border)] opacity-50" />

              {props.user ? (
                <>
                  <Link
                    href="/me"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[color:var(--fg)] hover:bg-[color:var(--chip)]"
                  >
                    <User className="h-5 w-5 text-[color:var(--muted)]" />
                    내 정보 ({props.user.name})
                  </Link>
                  <button
                    onClick={() => void signOut({ callbackUrl: '/' })}
                    className="flex items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/10"
                    aria-label="로그아웃"
                  >
                    <LogOut className="h-5 w-5" />
                    로그아웃
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-2xl btn-discord px-4 py-3 text-sm font-bold"
                >
                  <DiscordMark className="h-5 w-5" />
                  Discord 로그인
                </Link>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
