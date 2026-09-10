import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createCustomerAuthToken, normalizeEmail } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/services/customer-email';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
const generic = { ok: true, message: 'If an account matches that email, a reset link will be sent.' };
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const email = normalizeEmail(z.object({ email: z.string().trim().email() }).parse(await request.json()).email);
    const allowed = await durableRateLimit(env.DB, `forgot:${request.headers.get('cf-connecting-ip') || 'local'}:${email}`, 3, 60 * 60_000);
    if (!allowed) return Response.json(generic);
    const matches = await env.DB.prepare('SELECT id,email,password_hash FROM customers WHERE email_normalized=? OR lower(trim(email))=? LIMIT 2').bind(email, email).all<{ id: string; email: string; password_hash: string | null }>();
    const customer = matches.results.length === 1 ? matches.results[0] : null;
    if (customer?.password_hash) {
      const token = await createCustomerAuthToken(env.DB, customer.id, 'reset_password', 30 * 60_000);
      await sendPasswordResetEmail(customer.email, token);
    }
    return Response.json(generic);
  } catch (error) { return safeError(error, 'Enter a valid email address.'); }
}
