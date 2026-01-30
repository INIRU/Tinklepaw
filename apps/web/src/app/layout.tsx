import type { Metadata } from 'next';
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
import { fetchGuildMember, isAdmin } from '@/lib/server/discord';

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

  return {
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

  let showAdmin = false;
  if (session?.user?.id) {
    try {
        const member = await fetchGuildMember({ userId: session.user.id });
        if (member) showAdmin = await isAdmin({ userId: session.user.id, member });
    } catch {
        showAdmin = false;
    }
  }

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
              <div className="flex-1">
                <MainNav user={user} iconUrl={cfg.iconImageUrl} showAdmin={showAdmin} />
                <PageTransition>{children}</PageTransition>
              </div>
              <FooterGate user={user} />
            </div>
          </ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
