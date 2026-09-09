import { env } from 'cloudflare:workers';
import { canAccessOrder } from '@/lib/customer-auth';
import { createUPIPaymentURL } from '@/lib/services/whatsapp';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const order = await env.DB.prepare(
    'SELECT id,customer_id,order_number,status,order_type,payment_status,payment_method,subtotal,delivery_amount,total,estimated_delivery_date,promised_delivery_date,delivery_window,created_at,updated_at FROM orders WHERE order_number = ?',
  )
    .bind(orderId)
    .first<Record<string, unknown>>();
  if (!order)
    return Response.json({ error: 'Order not found' }, { status: 404 });
  if (
    !(await canAccessOrder(
      request,
      env.DB,
      String(order.id),
      String(order.customer_id),
    ))
  )
    return Response.json(
      { error: 'Sign in to view this order' },
      { status: 403 },
    );
  const [items, timeline] = await env.DB.batch([
    env.DB.prepare(
      "SELECT i.id,i.product_id,i.product_name,i.variant_name,i.quantity,i.unit_price,i.line_total,CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END reviewed,COALESCE((SELECT '/api/product-images/'||pi.id FROM product_images pi WHERE pi.product_id=i.product_id AND pi.role='main' ORDER BY pi.sort_order LIMIT 1),json_extract(p.images,'$[0]')) image FROM order_items i LEFT JOIN products p ON p.id=i.product_id LEFT JOIN reviews r ON r.order_item_id=i.id WHERE i.order_id = ?",
    ).bind(order.id),
    env.DB.prepare(
      'SELECT from_status,to_status,created_at FROM order_timeline WHERE order_id = ? ORDER BY created_at',
    ).bind(order.id),
  ]);
  const safeOrder = { ...order };
  delete safeOrder.id;
  delete safeOrder.customer_id;
  return Response.json({
    order: safeOrder,
    items: items.results,
    timeline: timeline.results,
    whatsappUrl: order.payment_method==='UPI'&&order.payment_status!=='paid'?createUPIPaymentURL({orderNumber:String(order.order_number),total:Number(order.total)}):undefined,
  });
}
