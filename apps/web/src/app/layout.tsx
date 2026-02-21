import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Geist_Mono, Gowun_Dodum, Jua } from 'next/font/google';
import './globals.css';
import ThemeScript from '@/components/theme/ThemeScript';
import MotionProvider from '@/components/motion/MotionProvider';
import PageTransition from '@/components/motion/PageTransition';
import MainNav from '@/components/nav/MainNav';
import AdminModeFab from '@/components/nav/AdminModeFab';
import MaintenancePageGate from '@/components/nav/MaintenancePageGate';
import FooterGate from '@/components/nav/FooterGate';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { auth } from '../../auth';
import { fetchPublicAppConfig } from '@/lib/server/app-config';
import { isAdminModeEnabled } from '@/lib/server/admin-mode';

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

  const rawAdmin = Boolean(session?.isAdmin || (process.env.NODE_ENV !== 'production' && session?.user?.id));
  const adminModeEnabled = rawAdmin ? await isAdminModeEnabled() : false;
  const showAdmin = rawAdmin && adminModeEnabled;

  const user = session?.user?.id
    ? {
        name: session.user.name ?? '사용자',
        imageUrl: session.user.image ?? null
      }
    : null;

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
                  <MaintenancePageGate
                    enabled={cfg.maintenanceModeEnabled}
                    reason={cfg.maintenanceModeReason}
                    until={cfg.maintenanceModeUntil}
                    targetPaths={cfg.maintenanceWebTargetPaths}
                    adminBypass={showAdmin}
                  >
                    {children}
                  </MaintenancePageGate>
                </PageTransition>
              </div>
              <FooterGate user={user} />
              <AdminModeFab visible={rawAdmin} enabled={showAdmin} />
            </div>
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
