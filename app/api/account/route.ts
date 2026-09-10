import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { createCustomerAuthToken, normalizeEmail } from '@/lib/customer-auth';
import { sendVerificationEmail } from '@/lib/services/customer-email';
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
});
export async function GET(request: Request) {
  const customer = await getCustomerFromRequest(request, env.DB);
  if (!customer)
    return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({ authenticated: true, customer });
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
  } catch (error) {
    return safeError(error);
  }
  const customer = await getCustomerFromRequest(request, env.DB);
  if (!customer)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = schema.parse(await request.json());
    const email = normalizeEmail(d.email);
    const duplicate = await env.DB.prepare('SELECT id FROM customers WHERE (email_normalized=? OR lower(trim(email))=?) AND id<>?').bind(email, email, customer.id).first();
    if (duplicate) return Response.json({ error: 'That email is already linked to another account.' }, { status: 409 });
    const emailChanged = email !== customer.email?.toLowerCase();
    await env.DB.prepare(
      "UPDATE customers SET name=?,email=?,email_normalized=?,email_verified_at=CASE WHEN ? THEN NULL ELSE email_verified_at END,auth_method=CASE WHEN auth_method='legacy' THEN 'email' ELSE auth_method END,updated_at=? WHERE id=?",
    )
      .bind(d.name, email, email, Number(emailChanged), new Date().toISOString(), customer.id)
      .run();
    if (emailChanged || !customer.email_verified_at) {
      const token = await createCustomerAuthToken(env.DB, customer.id, 'verify_email', 24 * 60 * 60 * 1000);
      const delivery = await sendVerificationEmail(email, token);
      return Response.json({ ok: true, verificationRequired: true, emailSent: delivery.sent });
    }
    return Response.json({ ok: true, verificationRequired: false });
  } catch {
    return Response.json({ error: 'Check your details.' }, { status: 400 });
  }
}
