import { env } from 'cloudflare:workers';
import { sha256 } from '@/lib/customer-auth';

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token))
    return Response.json(
      { error: 'Tracking link not found.' },
      { status: 404 },
    );
  const order = await env.DB.prepare(
    `SELECT o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total,o.estimated_delivery_date,o.promised_delivery_date,o.created_at
     FROM order_tracking_tokens t JOIN orders o ON o.id=t.order_id
     WHERE t.token_hash=? AND t.revoked_at IS NULL`,
  )
    .bind(await sha256(token))
    .first<Record<string, unknown>>();
  if (!order)
    return Response.json(
      { error: 'Tracking link not found.' },
      { status: 404 },
    );
  const [items, timeline, media] = await env.DB.batch([
    env.DB.prepare(`SELECT oi.product_name,oi.variant_name,oi.selected_finish,oi.quantity,oi.line_total,
      (SELECT '/api/product-images/'||pi.id FROM product_images pi WHERE pi.product_id=oi.product_id ORDER BY CASE pi.role WHEN 'main' THEN 0 ELSE 1 END,pi.sort_order LIMIT 1) image
      FROM order_items oi WHERE oi.order_id=? ORDER BY oi.created_at`).bind(
      order.id,
    ),
    env.DB.prepare(
      'SELECT to_status,note,created_at FROM order_timeline WHERE order_id=? ORDER BY created_at',
    ).bind(order.id),
    env.DB.prepare(
      'SELECT id,caption,content_type,created_at FROM order_milestone_media WHERE order_id=? AND customer_visible=1 ORDER BY created_at',
    ).bind(order.id),
  ]);
  return Response.json(
    {
      order: { ...order, id: undefined },
      items: items.results,
      timeline: timeline.results,
      milestoneMedia: media.results,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}
