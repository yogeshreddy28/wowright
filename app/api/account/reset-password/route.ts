import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { consumeCustomerAuthToken, hashCustomerPassword } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!(await durableRateLimit(env.DB, `reset-password:${request.headers.get('cf-connecting-ip') || 'local'}`, 8, 60_000))) return Response.json({ error: 'Please wait before trying again.' }, { status: 429 });
    const data = z.object({ token: z.string().min(32).max(200), password: z.string().min(10).max(128) }).parse(await request.json());
    const customerId = await consumeCustomerAuthToken(env.DB, data.token, 'reset_password');
    if (!customerId) return Response.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE customers SET password_hash=?,auth_method=CASE WHEN auth_method='google' THEN 'google,email' ELSE 'email' END,updated_at=? WHERE id=?").bind(await hashCustomerPassword(data.password), now, customerId),
      env.DB.prepare('DELETE FROM customer_sessions WHERE customer_id=?').bind(customerId),
    ]);
    return Response.json({ ok: true });
  } catch (error) { return safeError(error, 'Password could not be reset.'); }
}
