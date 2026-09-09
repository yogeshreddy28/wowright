import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { deliveryPerson } from '@/lib/delivery-auth';
import { generateDeliveryOtp, verifyDeliveryOtp } from '@/lib/services/delivery-otp';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';

function secret() { return env.DELIVERY_OTP_SECRET || env.AI_SETTINGS_ENCRYPTION_KEY; }
export async function POST(request: Request) {
  const person = await deliveryPerson(request, env.DB);
  if (!person) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const body = z.discriminatedUnion('action', [
      z.object({ action: z.enum(['generate', 'resend']), stopId: z.string().min(1) }),
      z.object({ action: z.literal('verify'), stopId: z.string().min(1), code: z.string().regex(/^\d{6}$/) }),
    ]).parse(await request.json());
    return Response.json(body.action === 'verify' ? await verifyDeliveryOtp(env.DB, person.id, body.stopId, body.code) : await generateDeliveryOtp(env.DB, person.id, body.stopId, secret()));
  } catch (error) { return safeError(error); }
}
