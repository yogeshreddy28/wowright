import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { fulfill } from '@/lib/services/fulfillment';
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    "SELECT o.id,o.order_number,o.status,o.payment_status,o.estimated_delivery_date,o.promised_delivery_date,o.is_test,i.id item_id,i.product_name,i.selected_finish,i.quantity,i.production_status,i.estimated_print_minutes,i.qc_passed_at,i.packed_at,i.reprint_count,(SELECT COALESCE(SUM(a.minutes),0) FROM production_allocations a WHERE a.order_item_id=i.id AND a.production_date<=date('now','+5 hours','+30 minutes')) allocated_today,(SELECT COUNT(*) FROM production_allocations a WHERE a.order_item_id=i.id) allocation_count,(SELECT MIN(a.production_date) FROM production_allocations a WHERE a.order_item_id=i.id AND a.production_date>=date('now','+5 hours','+30 minutes')) next_print_date,COALESCE((SELECT '/api/product-images/'||im.id FROM product_images im WHERE im.product_id=i.product_id ORDER BY CASE im.role WHEN 'main' THEN 0 ELSE 1 END,im.sort_order LIMIT 1),json_extract(p.images,'$[0]')) product_image FROM orders o JOIN order_items i ON i.order_id=o.id LEFT JOIN products p ON p.id=i.product_id WHERE o.status NOT IN ('delivered','cancelled','payment_pending','payment_failed','awaiting_confirmation','out_for_delivery','scheduled') ORDER BY CASE WHEN COALESCE(o.promised_delivery_date,o.estimated_delivery_date)<date('now','+5 hours','+30 minutes') THEN 0 ELSE 1 END,COALESCE(o.promised_delivery_date,o.estimated_delivery_date,'9999'),o.created_at,i.created_at LIMIT 300",
  ).all();
  return Response.json({ items: result.results, dailyCapacityMinutes: 600 });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const data = (await request.json()) as { orderId: string };
    return Response.json(await fulfill(env.DB, data.orderId, data));
  } catch (e) {
    return safeError(e);
  }
}
