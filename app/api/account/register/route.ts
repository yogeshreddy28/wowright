import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  createCustomerSession,
  hashCustomerPassword,
} from '@/lib/customer-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { durableRateLimit } from '@/lib/rate-limit';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string(),
  email: z.string().email().optional().or(z.literal('')),
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
    const existing = await env.DB.prepare(
      'SELECT id,password_hash FROM customers WHERE mobile=?',
    )
      .bind(mobile)
      .first<{ id: string; password_hash: string | null }>();
    if (existing)
      return Response.json(
        {
          error: existing.password_hash
            ? 'An account already exists for this number.'
            : 'This number has an existing guest order. Contact WOW RIGHT to securely activate the account.',
        },
        { status: 409 },
      );
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const passwordHash = await hashCustomerPassword(data.password);
    await env.DB.prepare(
      'INSERT INTO customers (id,name,mobile,email,password_hash,order_count,total_spent,created_at,updated_at) VALUES (?,?,?,?,?,0,0,?,?)',
    )
      .bind(id, data.name, mobile, data.email || null, passwordHash, now, now)
      .run();
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': await createCustomerSession(env.DB, id) } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Check your name, phone, email and password.'
            : 'Account could not be created.',
      },
      { status: 400 },
    );
  }
}
