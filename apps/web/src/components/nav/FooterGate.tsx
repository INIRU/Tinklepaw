"use client";

import { usePathname } from 'next/navigation';

import Footer from './Footer';

type FooterGateProps = {
  user: { name: string; imageUrl: string | null } | null;
};

export default function FooterGate({ user }: FooterGateProps) {
  const pathname = usePathname();
  if (
    pathname === '/draw' ||
    pathname.startsWith('/draw/') ||
    pathname.startsWith('/admin')
  )
    return null;
  return <Footer user={user} />;
}
