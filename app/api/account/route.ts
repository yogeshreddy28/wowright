import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().optional().or(z.literal('')),
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
    await env.DB.prepare(
      'UPDATE customers SET name=?,email=?,updated_at=? WHERE id=?',
    )
      .bind(d.name, d.email || null, new Date().toISOString(), customer.id)
      .run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Check your details.' }, { status: 400 });
  }
}
