import { env } from 'cloudflare:workers';
import {
  clearCustomerSessionCookie,
  revokeCustomerSession,
} from '@/lib/customer-auth';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await revokeCustomerSession(request, env.DB);
  } catch (error) {
    return safeError(error);
  }
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': clearCustomerSessionCookie } },
  );
}
