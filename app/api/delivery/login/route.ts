import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyCustomerPassword } from '@/lib/customer-auth';
import { deliveryCookie, revokeDeliverySession } from '@/lib/delivery-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { durableRateLimit } from '@/lib/rate-limit';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (
      !(await durableRateLimit(
        env.DB,
        `delivery-login:${request.headers.get('cf-connecting-ip') || 'local'}`,
        6,
        60000,
      ))
    )
      throw new CommerceError('Please wait before trying again.', 429);
    const data = z
      .object({ phone: z.string(), password: z.string().min(1).max(128) })
      .parse(await request.json());
    const person = await env.DB.prepare(
      'SELECT id,password_hash FROM delivery_people WHERE mobile=? AND active=1',
    )
      .bind(normalizeIndianPhone(data.phone))
      .first<{ id: string; password_hash: string }>();
    if (
      !person ||
      !(await verifyCustomerPassword(data.password, person.password_hash))
    )
      throw new CommerceError('Check your phone number and password.', 401);
    return Response.json(
      { ok: true },
      { headers: { 'Set-Cookie': await deliveryCookie(env.DB, person.id) } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    await revokeDeliverySession(request, env.DB);
    return Response.json(
      { ok: true },
      {
        headers: {
          'Set-Cookie': `wow_delivery_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
        },
      },
    );
  } catch (e) {
    return safeError(e);
  }
}
