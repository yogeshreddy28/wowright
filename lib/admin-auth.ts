const encoder = new TextEncoder();
function b64(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function b64Text(s: string) {
  return b64(encoder.encode(s));
}
async function sign(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 24)
    throw new Error('ADMIN_SESSION_SECRET must be at least 24 characters');
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(payload)),
    ),
  );
}
export async function createAdminToken(email: string) {
  const payload = `${email}|${Date.now() + 8 * 60 * 60 * 1000}`;
  return `${b64Text(payload)}.${await sign(payload)}`;
}
function decode(value: string) {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    return atob(normalized)
      .split('')
      .map((c) => String.fromCharCode(c.charCodeAt(0)))
      .join('');
  } catch {
    return '';
  }
}
export async function verifyAdmin(request: Request) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (
      request.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin && origin !== new URL(request.url).origin)
    )
      return false;
  }
  const cookie = request.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith('admin_session='))
    ?.split('=')[1];
  if (!cookie) return false;
  const [payload64, sig] = cookie.split('.');
  const payload = decode(payload64);
  const [, expiry] = payload.split('|');
  if (!expiry || Number(expiry) < Date.now()) return false;
  return (await sign(payload)) === sig;
}
export function secureCookie(token: string) {
  return `admin_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
