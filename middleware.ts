import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders } from '@/lib/security-headers';

const canonicalHost = 'wowright.in';

export function middleware(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = (forwardedHost || request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .split(':')[0]
    .toLowerCase();

  const forwardedProtocol = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    .trim()
    .toLowerCase();

  const destination = request.nextUrl.clone();
  if (host === `www.${canonicalHost}` || forwardedProtocol === 'http') {
    destination.protocol = 'https:';
    if (host === `www.${canonicalHost}`) destination.hostname = canonicalHost;
    destination.port = '';
    return NextResponse.redirect(destination, 308);
  }

  const response = NextResponse.next();
  applySecurityHeaders(
    response.headers,
    request.nextUrl.pathname,
    request.method,
  );
  return response;
}

export const config = {
  matcher: '/:path*',
};
