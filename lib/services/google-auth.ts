import { env } from 'cloudflare:workers';
import { sha256 } from '@/lib/customer-auth';

function base64Url(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function googleConfigured() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SITE_URL);
}

export function googleCallbackUrl() {
  return `${String(env.SITE_URL).replace(/\/$/, '')}/api/account/google/callback`;
}

export async function createGoogleAuthorization(db: D1Database, returnTo: string) {
  if (!googleConfigured()) throw new Error('Google sign-in is not configured.');
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const now = new Date();
  await db.prepare('INSERT INTO google_oauth_states (id,state_hash,nonce,code_verifier,return_to,expires_at,created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), await sha256(state), nonce, verifier, returnTo, new Date(now.getTime() + 10 * 60_000).toISOString(), now.toISOString()).run();
  const query = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!, redirect_uri: googleCallbackUrl(), response_type: 'code',
    scope: 'openid email profile', state, nonce, code_challenge: challenge,
    code_challenge_method: 'S256', prompt: 'select_account',
  });
  return { state, url: `https://accounts.google.com/o/oauth2/v2/auth?${query}` };
}

export function oauthCookie(state: string, clear = false) {
  return `wow_google_oauth=${clear ? '' : state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function readCookie(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

export async function exchangeGoogleCode(code: string, verifier: string, fetcher: typeof fetch = globalThis.fetch) {
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: googleCallbackUrl(), grant_type: 'authorization_code', code_verifier: verifier }),
  });
  if (!response.ok) throw new Error('Google authorization failed.');
  const tokens = await response.json() as { id_token?: string };
  if (!tokens.id_token) throw new Error('Google identity was not returned.');
  const validation = await fetcher(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token)}`);
  if (!validation.ok) throw new Error('Google identity could not be verified.');
  const profile = await validation.json() as { aud?: string; iss?: string; exp?: string; sub?: string; email?: string; email_verified?: string | boolean; name?: string; nonce?: string };
  if (profile.aud !== env.GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(profile.iss || '') || Number(profile.exp || 0) * 1000 <= Date.now() || !profile.sub || !profile.email || ![true, 'true'].includes(profile.email_verified as true | 'true')) throw new Error('Google identity could not be verified.');
  return profile as Required<Pick<typeof profile, 'sub' | 'email'>> & typeof profile;
}
