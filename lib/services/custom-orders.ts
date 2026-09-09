import { z } from 'zod';
import { CommerceError, assertBengaluru, launchTotals } from './launch-rules';
import { createOrderNumber } from './orders';
import { createUPIPaymentURL } from './whatsapp';
import { localDate } from './production';
export const quotePriceInput = z.object({
  requestId: z.string(),
  specifications: z.string().trim().min(10).max(5000),
  price: z.number().int().min(499).max(1000000),
  deliveryEstimate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export async function priceCustomRequest(db: D1Database, raw: unknown) {
  const d = quotePriceInput.parse(raw);
  if (
    d.deliveryEstimate < localDate() ||
    Number.isNaN(Date.parse(d.deliveryEstimate + 'T12:00:00Z'))
  )
    throw new CommerceError(
      'Choose today or a later owner-reviewed delivery date.',
    );
  const request = await db
    .prepare(
      'SELECT quantity FROM custom_quote_requests WHERE id=? AND order_id IS NULL',
    )
    .bind(d.requestId)
    .first<{ quantity: number }>();
  if (!request)
    throw new CommerceError(
      'Request not found or already converted to an order.',
      409,
    );
  if ((d.price * 100) % request.quantity !== 0)
    throw new CommerceError(
      'The subtotal must divide into an exact per-unit price in rupees and paise for this quantity.',
    );
  const result = await db
    .prepare(
      "UPDATE custom_quote_requests SET specifications=?,quoted_price=?,delivery_amount=?,delivery_estimate=?,quote_version=quote_version+1,approved_version=NULL,approved_at=NULL,status='quoted',updated_at=? WHERE id=? AND order_id IS NULL",
    )
    .bind(
      d.specifications,
      d.price,
      launchTotals(d.price).deliveryAmount,
      d.deliveryEstimate,
      new Date().toISOString(),
      d.requestId,
    )
    .run();
  if (!result.meta.changes)
    throw new CommerceError(
      'Request not found or already converted to an order.',
      409,
    );
  return { ok: true };
}
export async function approveCustomRequest(
  db: D1Database,
  customer: { id: string; mobile: string },
  requestId: string,
  version: number,
  address: {
    name: string;
    mobile: string;
    line1: string;
    line2?: string;
    locality: string;
    city: string;
    state: string;
    pinCode: string;
    landmark?: string;
    latitude: number;
    longitude: number;
  },
) {
  assertBengaluru(address);
  const quote = await db
    .prepare('SELECT * FROM custom_quote_requests WHERE id=? AND customer_id=?')
    .bind(requestId, customer.id)
    .first<Record<string, any>>();
  if (!quote) throw new CommerceError('Customization request not found.', 404);
  if (quote.order_id) {
    const order = await db
      .prepare(
        'SELECT order_number,total FROM orders WHERE id=? AND customer_id=?',
      )
      .bind(quote.order_id, customer.id)
      .first<{ order_number: string; total: number }>();
    if (!order) throw new CommerceError('Order is unavailable.');
    return {
      orderNumber: order.order_number,
      url: createUPIPaymentURL({
        orderNumber: order.order_number,
        total: order.total,
      }),
    };
  }
  if (
    quote.status !== 'quoted' ||
    quote.quote_version !== version ||
    !quote.quoted_price ||
    !quote.specifications
  )
    throw new CommerceError(
      'The quote changed. Review the latest specifications and price.',
      409,
    );
  const totals = launchTotals(quote.quoted_price),
    id = crypto.randomUUID(),
    itemId = crypto.randomUUID(),
    addressId = crypto.randomUUID(),
    orderNumber = await createOrderNumber(db),
    now = new Date().toISOString();
  if (
    !Number.isInteger(quote.quantity) ||
    quote.quantity < 1 ||
    (totals.subtotal * 100) % quote.quantity !== 0
  )
    throw new CommerceError(
      'Ask WOW RIGHT to review the quantity and per-unit pricing for this quote.',
      409,
    );
  await db.batch([
    db
      .prepare(
        'INSERT INTO customer_addresses(id,customer_id,line1,line2,locality,city,state,pin_code,landmark,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        addressId,
        customer.id,
        address.line1,
        address.line2 || null,
        address.locality,
        address.city,
        address.state,
        address.pinCode,
        address.landmark || null,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,status,payment_status,payment_method,order_type,subtotal,delivery_amount,total,latitude,longitude,estimated_delivery_date,created_at,updated_at) VALUES(?,?,?,?,?,'payment_pending','awaiting_payment','UPI','customizable',?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        orderNumber,
        `quote:${quote.id}:${version}`,
        customer.id,
        addressId,
        totals.subtotal,
        totals.deliveryAmount,
        totals.total,
        address.latitude,
        address.longitude,
        quote.delivery_estimate,
        now,
        now,
      ),
    // Guard trigger verifies quote version atomically; no partially saved approval.
    db
      .prepare(
        "UPDATE custom_quote_requests SET approved_version=?,approved_at=?,order_id=?,status='approved',updated_at=? WHERE id=?",
      )
      .bind(version, now, id, now, quote.id),
    db
      .prepare(
        'INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        itemId,
        id,
        quote.product_id || `custom:${quote.id}`,
        `Custom request ${quote.request_number}`,
        quote.quantity,
        totals.subtotal / quote.quantity,
        totals.subtotal,
        now,
        now,
      ),
    db
      .prepare(
        'INSERT INTO order_item_customizations(id,order_item_id,option_key,option_name,value,price_adjustment,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        itemId,
        'approved_specifications',
        'Approved specifications',
        quote.specifications,
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO order_timeline(id,order_id,to_status,note,actor,created_at) VALUES(?,?,'payment_pending','Specifications and quote approved. Awaiting full UPI payment.','customer',?)",
      )
      .bind(crypto.randomUUID(), id, now),
    db
      .prepare(
        'UPDATE customers SET order_count=order_count+1,last_order_at=? WHERE id=?',
      )
      .bind(now, customer.id),
  ]);
  return {
    orderNumber,
    url: createUPIPaymentURL({ orderNumber, total: totals.total }),
  };
}
