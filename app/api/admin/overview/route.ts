import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [orders, customers, quotes, companion] = await env.DB.batch([
    env.DB.prepare(
      "SELECT COUNT(*) count, COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) revenue, SUM(CASE WHEN status IN ('awaiting_confirmation','payment_pending') THEN 1 ELSE 0 END) awaiting, SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) confirmed, SUM(CASE WHEN status IN ('printing','in_production','quality_check') THEN 1 ELSE 0 END) production, SUM(CASE WHEN status IN ('packed','ready') THEN 1 ELSE 0 END) ready, SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) delivered FROM orders WHERE is_test=0",
    ),
    env.DB.prepare('SELECT COUNT(*) count FROM customers'),
    env.DB.prepare(
      "SELECT COUNT(*) count FROM custom_quote_requests WHERE status IN ('new','submitted','quoted')",
    ),
    env.DB.prepare(
      `SELECT
        SUM(CASE WHEN name='companion_prompt' THEN 1 ELSE 0 END) impressions,
        SUM(CASE WHEN name='companion_opened' THEN 1 ELSE 0 END) opens,
        SUM(CASE WHEN name IN ('companion_message','companion_message_sent') THEN 1 ELSE 0 END) messages,
        SUM(CASE WHEN name IN ('companion_recommendation_click','product_recommendation_clicked') THEN 1 ELSE 0 END) recommendation_clicks,
        SUM(CASE WHEN name='companion_quick_reply' THEN 1 ELSE 0 END) quick_replies
       FROM analytics_events`,
    ),
  ]);
  const companionOrders = await env.DB.prepare(
    'SELECT COUNT(*) assisted_orders, SUM(CASE WHEN companion_assisted_checkout=1 THEN 1 ELSE 0 END) assisted_checkouts FROM orders WHERE companion_engaged=1 AND is_test=0',
  ).first<Record<string, number>>();
  const [work, today, next] = await env.DB.batch([
    env.DB.prepare(
      "SELECT SUM(CASE WHEN i.production_status IN ('queued','reprint_required') THEN 1 ELSE 0 END) waiting_items,SUM(CASE WHEN i.production_status='printing' THEN 1 ELSE 0 END) printing_items,SUM(CASE WHEN i.production_status='quality_check' THEN 1 ELSE 0 END) qc_items,SUM(CASE WHEN i.production_status='qc_passed' THEN 1 ELSE 0 END) packing_items,SUM(CASE WHEN i.production_status IN ('queued','reprint_required') THEN COALESCE(i.estimated_print_minutes,0)*i.quantity ELSE 0 END) known_waiting_minutes,SUM(CASE WHEN i.estimated_print_minutes IS NULL THEN 1 ELSE 0 END) missing_print_times FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.is_test=0 AND o.payment_status IN ('paid','cod') AND o.status NOT IN ('cancelled','delivered')",
    ),
    env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM delivery_batches WHERE delivery_date=date('now','+5 hours','+30 minutes') AND status<>'completed') batches_today,COALESCE(SUM(CASE WHEN date(delivered_at,'+5 hours','+30 minutes')=date('now','+5 hours','+30 minutes') AND status='delivered' THEN total ELSE 0 END),0) delivered_sales_today,COALESCE(SUM(CASE WHEN payment_status='cod' AND status<>'cancelled' THEN total ELSE 0 END),0) cod_outstanding,SUM(CASE WHEN status NOT IN ('cancelled','delivered') AND COALESCE(promised_delivery_date,estimated_delivery_date)<date('now','+5 hours','+30 minutes') THEN 1 ELSE 0 END) delayed FROM orders WHERE is_test=0",
    ),
    env.DB.prepare(
      "SELECT o.order_number,i.product_name,i.production_status,i.estimated_print_minutes FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.is_test=0 AND o.payment_status IN ('paid','cod') AND o.status NOT IN ('cancelled','delivered','scheduled','out_for_delivery') AND i.production_status<>'packed' ORDER BY CASE WHEN COALESCE(o.promised_delivery_date,o.estimated_delivery_date)<date('now','+5 hours','+30 minutes') THEN 0 ELSE 1 END,CASE i.production_status WHEN 'quality_check' THEN 0 WHEN 'qc_passed' THEN 1 ELSE 2 END,o.created_at LIMIT 1",
    ),
  ]);
  const profit = await env.DB.prepare(
    "SELECT COALESCE(SUM(o.total),0) sales,COALESCE(SUM((SELECT SUM(i.unit_cost*i.quantity) FROM order_items i WHERE i.order_id=o.id)),0) product_cost,COALESCE(SUM((SELECT SUM(c.amount) FROM order_costs c WHERE c.order_id=o.id)),0) direct_costs,COALESCE(SUM((SELECT COUNT(*) FROM order_items i WHERE i.order_id=o.id AND i.unit_cost IS NULL)),0) missing_cost_lines FROM orders o WHERE o.is_test=0 AND o.status='delivered' AND date(o.delivered_at,'+5 hours','+30 minutes')=date('now','+5 hours','+30 minutes')",
  ).first<Record<string, number>>();
  return Response.json({
    profitToday: {
      estimatedProfit:
        (profit?.sales || 0) -
        (profit?.product_cost || 0) -
        (profit?.direct_costs || 0),
      missingCostLines: profit?.missing_cost_lines || 0,
    },
    orders: orders.results[0],
    customers: customers.results[0],
    quotes: quotes.results[0],
    work: work.results[0],
    today: today.results[0],
    nextItem: next.results[0] || null,
    companion: Object.assign(
      {},
      companion.results[0] as Record<string, unknown>,
      companionOrders,
    ),
  });
}
