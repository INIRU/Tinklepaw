import { NextResponse } from 'next/server';

import { auth } from '../auth';

export default auth((req) => {
  if (req.auth) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: [
    '/music/:path*',
    '/draw/:path*',
    '/lotto/:path*',
    '/stock/:path*',
    '/forge/:path*',
    '/inventory/:path*',
    '/notifications/:path*',
    '/me/:path*',
    '/admin/:path*'
  ]
};
