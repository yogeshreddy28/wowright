export function applySecurityHeaders(
  headers: Headers,
  path: string,
  method = 'GET',
) {
  headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  headers.set(
    'Content-Security-Policy',
    'upgrade-insecure-requests; block-all-mixed-content',
  );
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (path.startsWith('/_next/static/'))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  else if (path.startsWith('/catalog-products/'))
    headers.set(
      'Cache-Control',
      'public, max-age=604800, stale-while-revalidate=2592000',
    );
  else if (
    method === 'GET' &&
    (path === '/' ||
      path === '/shop' ||
      path.startsWith('/category/') ||
      path.startsWith('/product/') ||
      [
        '/about',
        '/contact',
        '/custom-print',
        '/policies',
        '/privacy',
        '/terms',
      ].includes(path))
  )
    headers.set(
      'Cache-Control',
      'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
    );
  return headers;
}
