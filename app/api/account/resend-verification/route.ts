import { env } from 'cloudflare:workers';
import { createCustomerAuthToken, getCustomerFromRequest } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/services/customer-email';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const customer = await getCustomerFromRequest(request, env.DB);
    if (!customer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!customer.email) return Response.json({ error: 'Add an email address first.' }, { status: 400 });
    if (customer.email_verified_at) return Response.json({ ok: true, alreadyVerified: true });
    if (!(await durableRateLimit(env.DB, `verify-resend:${customer.id}`, 3, 60 * 60_000))) return Response.json({ error: 'Please wait before requesting another email.' }, { status: 429 });
    const token = await createCustomerAuthToken(env.DB, customer.id, 'verify_email', 24 * 60 * 60_000);
    const result = await sendVerificationEmail(customer.email, token);
    return Response.json({ ok: true, emailSent: result.sent });
  } catch (error) { return safeError(error, 'Verification email could not be sent.'); }
}
