import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  createCustomerSession,
  verifyCustomerPassword,
} from '@/lib/customer-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { normalizeEmail } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';
const schema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
});
export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch (error) {
    return safeError(error);
  }
  if (
    !(await durableRateLimit(
      env.DB,
      `account-login:${request.headers.get('cf-connecting-ip') || 'local'}`,
      8,
      60_000,
    ))
  )
    return Response.json(
      { error: 'Please wait before trying again.' },
      { status: 429 },
    );
  try {
    const data = schema.parse(await request.json());
    const identifier = data.email.includes('@')
      ? normalizeEmail(data.email)
      : normalizeIndianPhone(data.email);
    const customer = await env.DB.prepare(
      'SELECT id,password_hash,email_verified_at FROM customers WHERE email_normalized=? OR (email_normalized IS NULL AND lower(trim(email))=?) OR (email_normalized IS NULL AND mobile=?)',
    )
      .bind(identifier, identifier, identifier)
      .first<{ id: string; password_hash: string | null; email_verified_at: string | null }>();
    if (
      !customer?.password_hash ||
      !(await verifyCustomerPassword(data.password, customer.password_hash))
    )
      return Response.json(
        { error: 'Incorrect email or password.' },
        { status: 401 },
      );
    return Response.json(
      { ok: true, emailVerified: Boolean(customer.email_verified_at) },
      {
        headers: {
          'Set-Cookie': await createCustomerSession(env.DB, customer.id),
        },
      },
    );
  } catch {
    return Response.json({ error: 'Incorrect email or password.' }, { status: 401 });
  }
}
