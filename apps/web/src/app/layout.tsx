import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist_Mono, Gowun_Dodum, Jua } from 'next/font/google';
import './globals.css';
import ThemeScript from '@/components/theme/ThemeScript';
import MotionProvider from '@/components/motion/MotionProvider';
import PageTransition from '@/components/motion/PageTransition';
import MainNav from '@/components/nav/MainNav';
import FooterGate from '@/components/nav/FooterGate';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { auth } from '../../auth';
import { fetchPublicAppConfig } from '@/lib/server/app-config';

function normalizeMaintenancePathTargets(items: string[]) {
  const normalized = items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith('/') ? item : `/${item}`))
    .map((item) => (item === '/' ? item : item.replace(/\/+$/, '')))
    .slice(0, 128);
  return Array.from(new Set(normalized));
}

function matchesMaintenancePath(pathname: string, target: string) {
  if (!target) return false;
  if (target === '/') return pathname === '/';

  if (target.endsWith('*')) {
    const prefix = target.slice(0, -1);
    if (!prefix) return false;
    return pathname.startsWith(prefix);
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

const gowunDodum = Gowun_Dodum({
  variable: '--font-kr-sans',
  subsets: ['latin'],
  weight: '400'
});

const jua = Jua({
  variable: '--font-kr-display',
  subsets: ['latin'],
  weight: '400'
});

const geistMono = Geist_Mono({
  variable: '--font-app-mono',
  subsets: ['latin']
});

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await fetchPublicAppConfig();
  const iconUrl = cfg.iconImageUrl ?? '/icon.jpg';
  const bannerUrl = cfg.bannerImageUrl ?? '/banner.png';

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const envBase = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    ''
  ).trim();
  const metadataBase = envBase
    ? new URL(envBase)
    : host
      ? new URL(`${proto}://${host}`)
      : new URL('http://localhost:3000');

  return {
    metadataBase,
    title: '동글동글 방울냥 서버',
    description: '동글동글 방울냥 서버 페이지',
    icons: {
      icon: [{ url: iconUrl }]
    },
    openGraph: {
      title: '동글동글 방울냥 서버',
      description: '동글동글 방울냥 서버 페이지',
      images: [{ url: bannerUrl }]
    },
    twitter: {
      card: 'summary_large_image',
      images: [bannerUrl]
    }
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const cfg = await fetchPublicAppConfig();
  const reqHeaders = await headers();
  const pathname = reqHeaders.get('x-pathname') ?? '/';

  const showAdmin = Boolean(session?.isAdmin || (process.env.NODE_ENV !== 'production' && session?.user?.id));

  const user = session?.user?.id
    ? {
        name: session.user.name ?? '사용자',
        imageUrl: session.user.image ?? null
      }
    : null;

  const maintenanceUntilMs = cfg.maintenanceModeUntil ? Date.parse(cfg.maintenanceModeUntil) : Number.NaN;
  const maintenanceUntilLabel = Number.isFinite(maintenanceUntilMs)
    ? new Date(maintenanceUntilMs).toLocaleString('ko-KR', { hour12: false })
    : null;
  const maintenancePathTargets = normalizeMaintenancePathTargets(cfg.maintenanceWebTargetPaths);
  const maintenanceLocked =
    cfg.maintenanceModeEnabled &&
    !showAdmin &&
    (
      maintenancePathTargets.length === 0 ||
      maintenancePathTargets.some((target) => matchesMaintenancePath(pathname, target))
    );

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${gowunDodum.variable} ${jua.variable} ${geistMono.variable} antialiased`}>
        <MotionProvider>
          <ToastProvider>
            <div className="min-h-screen flex flex-col bg-bangul text-[color:var(--fg)]">
              <div className="flex-1 min-h-0 flex flex-col">
                <MainNav user={user} iconUrl={cfg.iconImageUrl} showAdmin={showAdmin} />
                <PageTransition className="flex-1 min-h-0">
                  {maintenanceLocked ? (
                    <main className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl items-center px-4 py-10">
                      <section className="w-full rounded-3xl border border-[color:var(--border)] bg-[color:var(--card)]/92 p-6 shadow-[0_20px_48px_rgba(0,0,0,0.18)] sm:p-8">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[color:var(--muted-2)]">MAINTENANCE MODE</p>
                        <h1 className="mt-2 text-2xl font-black text-[color:var(--fg)]">현재 점검 중입니다</h1>
                        <p className="mt-3 text-sm text-[color:color-mix(in_srgb,var(--fg)_76%,transparent)]">
                          서비스 안정화를 위해 웹 접근을 일시적으로 제한했습니다. 관리자 계정은 점검 중에도 접속 가능합니다.
                        </p>

                        {cfg.maintenanceModeReason ? (
                          <div className="mt-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/65 p-4">
                            <div className="text-xs font-semibold tracking-wide text-[color:var(--muted-2)]">점검 사유</div>
                            <div className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--fg)]">{cfg.maintenanceModeReason}</div>
                          </div>
                        ) : null}

                        <div className="mt-5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--chip)]/65 p-4 text-sm">
                          <div className="text-xs font-semibold tracking-wide text-[color:var(--muted-2)]">예상 종료</div>
                          <div className="mt-2 text-[color:var(--fg)]">
                            {maintenanceUntilLabel ? maintenanceUntilLabel : '종료 시각 미정'}
                          </div>
                        </div>
                      </section>
                    </main>
                  ) : (
                    children
                  )}
                </PageTransition>
              </div>
              <FooterGate user={user} />
            </div>
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
