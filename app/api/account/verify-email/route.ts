import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { consumeCustomerAuthToken } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!(await durableRateLimit(env.DB, `verify-email:${request.headers.get('cf-connecting-ip') || 'local'}`, 12, 60_000))) return Response.json({ error: 'Please wait before trying again.' }, { status: 429 });
    const { token } = z.object({ token: z.string().min(32).max(200) }).parse(await request.json());
    const customerId = await consumeCustomerAuthToken(env.DB, token, 'verify_email');
    if (!customerId) return Response.json({ error: 'This verification link is invalid or has expired.' }, { status: 400 });
    const now = new Date().toISOString();
    await env.DB.prepare('UPDATE customers SET email_verified_at=?,updated_at=? WHERE id=?').bind(now, now, customerId).run();
    return Response.json({ ok: true });
  } catch (error) { return safeError(error, 'Email could not be verified.'); }
}
