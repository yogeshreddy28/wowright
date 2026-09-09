import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { approveCustomRequest } from '@/lib/services/custom-orders';
import { checkoutAddress } from '@/app/api/checkout/route';
export async function GET(r: Request) {
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await env.DB.prepare(
    'SELECT id,request_number,description,quantity,status,specifications,quoted_price,delivery_amount,delivery_estimate,quote_version,order_id FROM custom_quote_requests WHERE customer_id=? ORDER BY created_at DESC LIMIT 100',
  )
    .bind(c.id)
    .all();
  return Response.json({ quotes: rows.results });
}
export async function POST(r: Request) {
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(r);
    const d = z
      .object({
        requestId: z.string(),
        version: z.number().int().positive(),
        accepted: z.literal(true),
        customer: checkoutAddress,
      })
      .parse(await r.json());
    return Response.json(
      await approveCustomRequest(env.DB, c, d.requestId, d.version, d.customer),
    );
  } catch (e) {
    return safeError(e);
  }
}
