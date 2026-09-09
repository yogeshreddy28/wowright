import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { overrideDeliveryOtp } from '@/lib/services/delivery-otp';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const data = z.object({ stopId: z.string().min(1), reason: z.string().trim().min(10).max(500) }).parse(await request.json());
    return Response.json(await overrideDeliveryOtp(env.DB, data.stopId, data.reason));
  } catch (error) { return safeError(error); }
}
