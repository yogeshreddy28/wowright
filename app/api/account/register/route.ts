import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  createCustomerAuthToken,
  createCustomerSession,
  hashCustomerPassword,
  normalizeEmail,
} from '@/lib/customer-auth';
import { sendVerificationEmail } from '@/lib/services/customer-email';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { durableRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string(),
  email: z.string().trim().email(),
  password: z.string().min(10).max(128),
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
      `account-register:${request.headers.get('cf-connecting-ip') || 'local'}`,
      6,
      60_000,
    ))
  )
    return Response.json(
      { error: 'Please wait before trying again.' },
      { status: 429 },
    );
  try {
    const data = schema.parse(await request.json());
    const mobile = normalizeIndianPhone(data.phone);
    const email = normalizeEmail(data.email);
    const existing = await env.DB.prepare(
      'SELECT id,password_hash FROM customers WHERE mobile=? OR email_normalized=? OR lower(trim(email))=?',
    )
      .bind(mobile, email, email)
      .first<{ id: string; password_hash: string | null }>();
    if (existing)
      return Response.json(
        {
          error: existing.password_hash
            ? 'An account already exists for these details.'
            : 'These details belong to an existing guest order. Contact WOW RIGHT to securely activate the account.',
        },
        { status: 409 },
      );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashCustomerPassword(data.password);
    await env.DB.prepare(
      "INSERT INTO customers (id,name,mobile,email,email_normalized,email_verified_at,auth_method,password_hash,order_count,total_spent,created_at,updated_at) VALUES (?,?,?,?,?,NULL,'email',?,0,0,?,?)",
    )
      .bind(id, data.name, mobile, email, email, passwordHash, now, now)
      .run();
    const token = await createCustomerAuthToken(env.DB, id, 'verify_email', 24 * 60 * 60 * 1000);
    const delivery = await sendVerificationEmail(email, token);
    return Response.json(
      { ok: true, verificationRequired: true, emailSent: delivery.sent },
      { headers: { 'Set-Cookie': await createCustomerSession(env.DB, id) } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Enter your name, valid email, phone number and a password of at least 10 characters.'
            : 'Account could not be created.',
      },
      { status: 400 },
    );
  }
}
