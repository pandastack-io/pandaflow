import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';

export default auth((request) => {
  if (process.env.SKIP_AUTH === 'true') {
    return NextResponse.next();
  }

  if (request.auth?.user) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const signInUrl = new URL('/sign-in', request.nextUrl.origin);
  signInUrl.searchParams.set('callbackUrl', request.nextUrl.href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    '/workflows/:path*',
    '/agents/:path*',
    '/executions/:path*',
    '/secrets/:path*',
    '/settings/:path*',
    '/templates/:path*',
    '/api/workflows/:path*',
    '/api/agents/:path*',
    '/api/executions/:path*',
  ],
};
