import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { sameOrigin } from '@/lib/services/launch-rules';
const schema = z.object({
  sessionId: z.string().uuid(),
  currentProductId: z.string().max(100).optional(),
  checkoutProgress: z.enum(['browsing', 'cart', 'checkout', 'order_saved']),
  intentScore: z.number().int().min(0).max(100),
  intentStage: z.enum([
    'explorer',
    'interested',
    'evaluating',
    'high_intent',
    'ready_to_buy',
  ]),
  dismissals: z.number().int().min(0).max(20),
  companionEngaged: z.boolean(),
  source: z.string().max(100).optional(),
  campaign: z.string().max(200).optional(),
  context: z.record(z.string(), z.unknown()),
});
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const d = schema.parse(await r.json());
    if (JSON.stringify(d.context).length > 16000)
      return Response.json({ ok: false }, { status: 413 });
    const customer = await getCustomerFromRequest(r, env.DB);
    const existing = await env.DB.prepare(
      'SELECT customer_id FROM sessions WHERE id=?',
    )
      .bind(d.sessionId)
      .first<{ customer_id: string | null }>();
    if (existing?.customer_id && existing.customer_id !== customer?.id)
      return Response.json({ ok: false }, { status: 403 });
    if (!rateLimit(`companion-session:${d.sessionId}`, 45, 60_000))
      return Response.json({ ok: false }, { status: 429 });
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO sessions (id,current_product_id,checkout_progress,companion_context,intent_score,intent_stage,companion_dismissals,companion_engaged,source,campaign,last_activity,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET current_product_id=excluded.current_product_id,checkout_progress=excluded.checkout_progress,companion_context=excluded.companion_context,intent_score=excluded.intent_score,intent_stage=excluded.intent_stage,companion_dismissals=excluded.companion_dismissals,companion_engaged=excluded.companion_engaged,source=excluded.source,campaign=excluded.campaign,last_activity=excluded.last_activity,updated_at=excluded.updated_at`,
    )
      .bind(
        d.sessionId,
        d.currentProductId || null,
        d.checkoutProgress,
        JSON.stringify(d.context),
        d.intentScore,
        d.intentStage,
        d.dismissals,
        d.companionEngaged ? 1 : 0,
        d.source || null,
        d.campaign || null,
        now,
        now,
        now,
      )
      .run();
    if (customer)
      await env.DB.prepare(
        'UPDATE sessions SET customer_id=? WHERE id=? AND (customer_id IS NULL OR customer_id=?)',
      )
        .bind(customer.id, d.sessionId, customer.id)
        .run();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
