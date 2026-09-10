import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createCustomerSession, sha256 } from '@/lib/customer-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { oauthCookie, readCookie } from '@/lib/services/google-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const state = readCookie(request, 'wow_google_oauth');
    if (!state) return Response.json({ error: 'Google sign-in expired. Please try again.' }, { status: 401 });
    if (!(await durableRateLimit(env.DB, `google-complete:${await sha256(state)}`, 5, 10 * 60_000))) return Response.json({ error: 'Please wait before trying again.' }, { status: 429 });
    const data = z.object({ name: z.string().trim().min(2).max(100), phone: z.string() }).parse(await request.json());
    const row = await env.DB.prepare('SELECT id,pending_email,pending_subject,return_to,expires_at,completed_at FROM google_oauth_states WHERE state_hash=?').bind(await sha256(state)).first<{ id: string; pending_email: string | null; pending_subject: string | null; return_to: string; expires_at: string; completed_at: string | null }>();
    if (!row?.completed_at || !row.pending_email || !row.pending_subject || row.expires_at <= new Date().toISOString()) return Response.json({ error: 'Google sign-in expired. Please try again.' }, { status: 401 });
    const mobile = normalizeIndianPhone(data.phone);
    if (await env.DB.prepare('SELECT id FROM customers WHERE mobile=? OR email_normalized=? OR lower(trim(email))=? OR google_subject=?').bind(mobile, row.pending_email, row.pending_email, row.pending_subject).first()) return Response.json({ error: 'Those details are already linked to an account. Sign in instead.' }, { status: 409 });
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO customers (id,name,mobile,email,email_normalized,email_verified_at,auth_method,google_subject,order_count,total_spent,created_at,updated_at) VALUES (?,?,?,?,?,?,'google',?,0,0,?,?)").bind(id, data.name, mobile, row.pending_email, row.pending_email, now, row.pending_subject, now, now),
      env.DB.prepare('DELETE FROM google_oauth_states WHERE id=?').bind(row.id),
    ]);
    const headers = new Headers();
    headers.append('Set-Cookie', await createCustomerSession(env.DB, id));
    headers.append('Set-Cookie', oauthCookie('', true));
    return Response.json({ ok: true, returnTo: row.return_to }, { headers });
  } catch (error) { return safeError(error, 'Google account could not be completed.'); }
}
