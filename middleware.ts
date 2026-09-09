import { NextResponse, type NextRequest } from 'next/server';

const canonicalHost = 'wowright.in';

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = (forwardedHost || request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .split(':')[0]
    .toLowerCase();

  if (host !== `www.${canonicalHost}`) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.protocol = 'https:';
  destination.hostname = canonicalHost;
  destination.port = '';
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: '/:path*',
};
