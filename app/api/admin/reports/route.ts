import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { z } from 'zod';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { flushMetaOutbox, metaConfig } from '@/lib/services/meta';
import { localDate, addDays } from '@/lib/services/production';
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const period = new URL(request.url).searchParams.get('period') || 'month',
    days = period === 'today' ? 0 : period === 'week' ? 6 : 29,
    from = addDays(localDate(), -days);
  const [economics, collections, funnel, campaigns, outbox, costs] =
    await env.DB.batch([
      env.DB.prepare(
        "SELECT COUNT(*) delivered_orders,COALESCE(SUM(o.total),0) sales,COALESCE(SUM((SELECT SUM(i.unit_cost*i.quantity) FROM order_items i WHERE i.order_id=o.id)),0) product_cost,COALESCE(SUM((SELECT SUM(c.amount) FROM order_costs c WHERE c.order_id=o.id)),0) direct_costs,COALESCE(SUM((SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id AND i.unit_cost IS NULL)),0) missing_cost_lines FROM orders o WHERE o.is_test=0 AND o.status='delivered' AND date(o.delivered_at,'+5 hours','+30 minutes')>=?",
      ).bind(from),
      env.DB.prepare(
        "SELECT COALESCE(SUM(CASE WHEN o.payment_status='cod' AND o.status<>'cancelled' THEN o.total ELSE 0 END),0) cod_outstanding,(SELECT COALESCE(SUM(p.amount_collected),0) FROM payment_collections p JOIN orders n ON n.id=p.order_id WHERE n.is_test=0 AND p.method='cash') cash_collected,(SELECT COALESCE(SUM(p.amount_collected),0) FROM payment_collections p JOIN orders n ON n.id=p.order_id WHERE n.is_test=0 AND p.method='UPI') upi_collected,(SELECT COALESCE(SUM(p.amount_collected),0) FROM payment_collections p JOIN orders n ON n.id=p.order_id WHERE n.is_test=0 AND p.settlement_status='pending') settlement_pending FROM orders o WHERE o.is_test=0",
      ),
      env.DB.prepare(
        "SELECT name,COUNT(*) events,COUNT(DISTINCT session_id) sessions FROM analytics_events e WHERE date(created_at,'+5 hours','+30 minutes')>=? AND (order_id IS NULL OR NOT EXISTS(SELECT 1 FROM orders o WHERE o.id=e.order_id AND o.is_test=1)) GROUP BY name ORDER BY events DESC",
      ).bind(from),
      env.DB.prepare(
        "SELECT COALESCE(json_extract(campaign_attribution,'$.utm_campaign'),'Unattributed') campaign,COUNT(*) orders,SUM(CASE WHEN status='delivered' THEN total ELSE 0 END) delivered_sales FROM orders WHERE is_test=0 AND date(created_at,'+5 hours','+30 minutes')>=? GROUP BY campaign",
      ).bind(from),
      env.DB.prepare(
        'SELECT status,COUNT(*) count FROM commerce_outbox GROUP BY status',
      ),
      env.DB.prepare(
        'SELECT c.*,o.order_number FROM order_costs c JOIN orders o ON o.id=c.order_id ORDER BY c.created_at DESC LIMIT 50',
      ),
    ]);
  const e = economics.results[0] as Record<string, number>;
  return Response.json({
    period,
    from,
    economics: {
      ...e,
      estimatedNetProfit: e.sales - e.product_cost - e.direct_costs,
      allCostsVerified: false,
      dailyTarget: 2000,
    },
    collections: collections.results[0],
    funnel: funnel.results,
    campaigns: campaigns.results,
    outbox: outbox.results,
    costs: costs.results,
    metaConfigured: metaConfig().configured,
  });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const raw = (await request.json()) as { action: string };
    if (raw.action === 'flush_meta')
      return Response.json(await flushMetaOutbox(env.DB));
    const d = z
      .object({
        action: z.literal('cost'),
        orderNumber: z.string(),
        category: z.enum([
          'delivery',
          'material_adjustment',
          'other_direct',
          'advertising',
        ]),
        amount: z.number().int().min(0).max(10000000),
        note: z.string().trim().min(3).max(500),
      })
      .parse(raw);
    const order = await env.DB.prepare(
      'SELECT id FROM orders WHERE order_number=?',
    )
      .bind(d.orderNumber)
      .first<{ id: string }>();
    if (!order)
      return Response.json({ error: 'Order not found.' }, { status: 404 });
    await env.DB.prepare(
      'INSERT INTO order_costs(id,order_id,category,amount,note,created_at) VALUES(?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        order.id,
        d.category,
        d.amount,
        d.note,
        new Date().toISOString(),
      )
      .run();
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
