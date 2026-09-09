import { env } from 'cloudflare:workers';
import { getCustomerFromRequest } from '@/lib/customer-auth';
export async function GET(r: Request) {
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [orders, reviewItems] = await env.DB.batch([env.DB.prepare(
    `SELECT order_number,status,payment_status,payment_method,total,created_at,updated_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 100`,
  ).bind(c.id), env.DB.prepare("SELECT i.id item_id,i.product_name,o.order_number,COALESCE((SELECT '/api/product-images/'||pi.id FROM product_images pi WHERE pi.product_id=i.product_id AND pi.role='main' ORDER BY pi.sort_order LIMIT 1),json_extract(p.images,'$[0]')) image FROM order_items i JOIN orders o ON o.id=i.order_id LEFT JOIN products p ON p.id=i.product_id LEFT JOIN reviews r ON r.order_item_id=i.id WHERE o.customer_id=? AND o.status='delivered' AND o.is_test=0 AND r.id IS NULL ORDER BY o.delivered_at DESC,o.updated_at DESC").bind(c.id)]);
  return Response.json({ orders: orders.results, reviewItems: reviewItems.results });
}
