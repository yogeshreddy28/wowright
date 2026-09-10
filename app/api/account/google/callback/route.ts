import { env } from 'cloudflare:workers';
import { createCustomerSession, normalizeEmail, sha256 } from '@/lib/customer-auth';
import { exchangeGoogleCode, oauthCookie, readCookie } from '@/lib/services/google-auth';

function destination(request: Request, path: string) { return new URL(path, env.SITE_URL || request.url).toString(); }
function redirectWithCookies(url: string, cookies: string[]) {
  const headers = new Headers({ Location: url });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const cookieState = readCookie(request, 'wow_google_oauth');
  try {
    if (!state || !code || !cookieState || state !== cookieState) throw new Error('Invalid state');
    const row = await env.DB.prepare('SELECT id,nonce,code_verifier,return_to,expires_at,completed_at FROM google_oauth_states WHERE state_hash=?').bind(await sha256(state)).first<{ id: string; nonce: string; code_verifier: string; return_to: string; expires_at: string; completed_at: string | null }>();
    if (!row || row.completed_at || row.expires_at <= new Date().toISOString()) throw new Error('Expired state');
    const profile = await exchangeGoogleCode(code, row.code_verifier);
    if (profile.nonce !== row.nonce) throw new Error('Invalid nonce');
    const email = normalizeEmail(profile.email);
    const matches = await env.DB.prepare('SELECT id,google_subject FROM customers WHERE google_subject=? OR email_normalized=? OR lower(trim(email))=? LIMIT 2').bind(profile.sub, email, email).all<{ id: string; google_subject: string | null }>();
    const subjectMatch = matches.results.find(item => item.google_subject === profile.sub);
    if (!subjectMatch && matches.results.length > 1) throw new Error('Ambiguous legacy email');
    const existing = subjectMatch || matches.results[0];
    const now = new Date().toISOString();
    if (existing) {
      await env.DB.batch([
        env.DB.prepare("UPDATE customers SET email=?,email_normalized=?,email_verified_at=?,google_subject=?,auth_method=CASE WHEN password_hash IS NULL THEN 'google' ELSE 'google,email' END,updated_at=? WHERE id=?").bind(email, email, now, profile.sub, now, existing.id),
        env.DB.prepare('UPDATE google_oauth_states SET completed_at=? WHERE id=?').bind(now, row.id),
      ]);
      return redirectWithCookies(destination(request, row.return_to), [await createCustomerSession(env.DB, existing.id), oauthCookie('', true)]);
    }
    await env.DB.prepare('UPDATE google_oauth_states SET pending_email=?,pending_name=?,pending_subject=?,completed_at=? WHERE id=?').bind(email, String(profile.name || email.split('@')[0]).slice(0, 100), profile.sub, now, row.id).run();
    return Response.redirect(destination(request, `/account?googleComplete=1${row.return_to === '/checkout' ? '&returnTo=checkout' : ''}`), 302);
  } catch {
    return redirectWithCookies(destination(request, '/account?authError=google_failed'), [oauthCookie('', true)]);
  }
}
