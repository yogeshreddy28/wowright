import { env } from 'cloudflare:workers';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { z } from 'zod';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { mutateOrder, readOperationOrder } from '@/lib/services/order-mutation';
import { prepareCommerceEvent } from '@/lib/services/tracking';
import { localDate } from '@/lib/services/production';
import { getCatalogProductById } from '@/lib/catalog-repository';
import {
  assertPurchasableProduct,
  calculateUnitPrice,
} from '@/lib/services/pricing';
export async function POST(
  r: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(r);
    const { orderId } = await params,
      d = z
        .object({ action: z.enum(['cancel', 'reorder']) })
        .parse(await r.json()),
      order = await readOperationOrder(env.DB, orderId);
    if (order.customer_id !== c.id)
      throw new CommerceError('Order not found.', 404);
    if (d.action === 'cancel') {
      if (
        order.order_type === 'customizable' ||
        !['confirmed', 'order_placed', 'payment_pending'].includes(order.status)
      )
        throw new CommerceError(
          'Printing has started or this is a custom order. Contact support about cancellation.',
        );
      if (
        await env.DB.prepare(
          "SELECT id FROM order_items WHERE order_id=? AND production_status<>'queued' LIMIT 1",
        )
          .bind(order.id)
          .first()
      )
        throw new CommerceError('Printing has started. Contact support.');
      const event = await prepareCommerceEvent(
        env.DB,
        order,
        'order_cancelled',
      );
      await mutateOrder(
        env.DB,
        order,
        {
          status: 'cancelled',
          note: 'Cancelled by customer before printing.',
          actor: 'customer',
        },
        (token) => [
          ...event(token),
          env.DB.prepare(
            'DELETE FROM production_allocations WHERE production_date>=? AND order_item_id IN(SELECT id FROM order_items WHERE order_id=?) AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)',
          ).bind(localDate(), order.id, order.id, token),
        ],
      );
      return Response.json({ ok: true });
    }
    const lines = (
        await env.DB.prepare('SELECT * FROM order_items WHERE order_id=?')
          .bind(order.id)
          .all<Record<string, any>>()
      ).results,
      items = [];
    for (const line of lines) {
      const product = assertPurchasableProduct(
        await getCatalogProductById(line.product_id),
      );
      const custom = (
        await env.DB.prepare(
          'SELECT option_key,value FROM order_item_customizations WHERE order_item_id=?',
        )
          .bind(line.id)
          .all<{ option_key: string; value: string }>()
      ).results;
      const selections = Object.fromEntries(
        custom.map((selected) => {
          const option = product.options.find(
            (o) => o.key === selected.option_key,
          );
          const value =
            option?.type === 'boolean'
              ? selected.value === 'true'
              : option?.type === 'number'
                ? Number(selected.value)
                : selected.value;
          return [selected.option_key, value];
        }),
      );
      const price = calculateUnitPrice(
        product,
        selections,
        line.variant_id || undefined,
      );
      items.push({
        id: crypto.randomUUID(),
        productId: product.id,
        slug: product.slug,
        name: product.name,
        quantity: line.quantity,
        selections,
        unitPrice: price.unitPrice,
        image: product.images[0],
        variantId: line.variant_id || undefined,
        variantName: line.variant_name || undefined,
      });
    }
    return Response.json({ items });
  } catch (e) {
    return safeError(
      e,
      'Some items or options are no longer available. Choose them again in the shop.',
    );
  }
}
