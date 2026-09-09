import { dispatchMetaInBackground } from '@/lib/services/meta-background';
import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { createOrderUpdateURL } from '@/lib/services/whatsapp';
import { z } from 'zod';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { confirmUPI, fulfill } from '@/lib/services/fulfillment';
import { mutateOrder, readOperationOrder } from '@/lib/services/order-mutation';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orderId } = await params;
  const order = await env.DB.prepare(
    'SELECT o.*,c.name customer_name,c.mobile,c.email,a.line1,a.line2,a.locality,a.city,a.state,a.pin_code,a.landmark FROM orders o JOIN customers c ON c.id=o.customer_id JOIN customer_addresses a ON a.id=o.address_id WHERE o.order_number=? OR o.id=?',
  )
    .bind(orderId, orderId)
    .first<Record<string, unknown>>();
  if (!order) return Response.json({ error: 'Not found' }, { status: 404 });
  const [items, timeline, conversation, customizations, proofs, collections, deliveryVerification] =
    await env.DB.batch([
      env.DB.prepare('SELECT * FROM order_items WHERE order_id=?').bind(
        order.id,
      ),
      env.DB.prepare(
        'SELECT * FROM order_timeline WHERE order_id=? ORDER BY created_at DESC',
      ).bind(order.id),
      env.DB.prepare(
        'SELECT m.* FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.session_id=? ORDER BY m.created_at',
      ).bind(order.session_id),
      env.DB.prepare(
        'SELECT c.* FROM order_item_customizations c JOIN order_items i ON i.id=c.order_item_id WHERE i.order_id=?',
      ).bind(order.id),
      env.DB.prepare(
        'SELECT id,created_at FROM delivery_proofs WHERE order_id=? ORDER BY created_at DESC',
      ).bind(order.id),
      env.DB.prepare(
        'SELECT method,amount_due,amount_collected,settlement_status,collected_at,settled_at FROM payment_collections WHERE order_id=?',
      ).bind(order.id),
      env.DB.prepare("SELECT s.id stop_id,s.status,(SELECT CASE WHEN x.override_reason IS NOT NULL THEN 'admin_override' WHEN x.verified_at IS NOT NULL THEN 'verified' WHEN julianday(x.expires_at)<=julianday('now') THEN 'expired' ELSE 'pending' END FROM delivery_otps x WHERE x.stop_id=s.id AND x.invalidated_at IS NULL ORDER BY x.generated_at DESC LIMIT 1) otp_status,(SELECT x.override_reason FROM delivery_otps x WHERE x.stop_id=s.id AND x.invalidated_at IS NULL ORDER BY x.generated_at DESC LIMIT 1) override_reason FROM delivery_stops s WHERE s.order_id=? ORDER BY s.created_at DESC LIMIT 1").bind(order.id),
    ]);
  return Response.json({
    order,
    updateWhatsAppURL: createOrderUpdateURL({
      orderNumber: String(order.order_number),
      status: String(order.status),
      mobile: String(order.mobile),
      deliveryDate: String(order.promised_delivery_date || ''),
      deliveryWindow: String(order.delivery_window || ''),
    }),
    items: items.results,
    customizations: customizations.results,
    timeline: timeline.results,
    conversation: conversation.results,
    proofs: proofs.results,
    collections: collections.results,
    deliveryVerification: deliveryVerification.results[0] || null,
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const { orderId } = await params;
    const data = z
      .object({
        status: z.string().optional(),
        paymentStatus: z.enum(['paid', 'cod']).optional(),
        paymentMethod: z.enum(['UPI', 'COD']).optional(),
        internalNotes: z.string().max(5000).optional(),
      })
      .parse(await request.json());
    if (data.paymentStatus === 'paid' && data.paymentMethod === 'UPI') {
      const result = await confirmUPI(env.DB, orderId);
      dispatchMetaInBackground(env.DB);
      return Response.json(result);
    }
    if (data.status === 'cancelled')
      return Response.json(
        await fulfill(env.DB, orderId, {
          action: 'cancel',
          note: data.internalNotes || 'Cancelled by owner',
        }),
      );
    if (data.status || data.paymentStatus || data.paymentMethod)
      throw new CommerceError(
        'Use Production for item checks and Delivery for dispatch. Payment methods cannot be switched after checkout.',
      );
    const order = await readOperationOrder(env.DB, orderId);
    if (data.internalNotes !== undefined)
      await mutateOrder(env.DB, order, {
        note: 'Internal note updated',
        actor: 'admin',
        extra: { internal_notes: data.internalNotes },
      });
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error);
  }
}
