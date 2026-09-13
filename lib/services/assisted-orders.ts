import { z } from 'zod';
import { normalizeEmail, sha256 } from '@/lib/customer-auth';
import { normalizeIndianPhone } from './phone';
import { assertBengaluru, CommerceError, launchTotals } from './launch-rules';
import { createOrderNumber } from './orders';
import { planOrder } from './production';
import { getPaymentConfig } from './delivery';

export const assistedOrderSources = [
  'whatsapp',
  'meta_ad',
  'instagram',
  'facebook',
  'phone',
  'walk_in',
  'other',
] as const;

const addressSchema = z.object({
  savedAddressId: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(40).default('WhatsApp order'),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pinCode: z.string().regex(/^560\d{3}$/),
  landmark: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(500).optional(),
  latitude: z.coerce.number().finite(),
  longitude: z.coerce.number().finite(),
  locationAccuracy: z.coerce.number().finite().min(0).max(100000).optional(),
});

export const assistedOrderInput = z.object({
  // Protected Admin API only. The customer-facing builder never sends this.
  // It exists so controlled production rehearsals remain excluded from
  // operational reporting, Meta events and clean-launch data.
  testMode: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100),
  customer: z.object({
    mobile: z.string(),
    name: z.string().trim().min(2).max(100),
    email: z.union([z.string().trim().email(), z.literal('')]).optional(),
  }),
  address: addressSchema,
  items: z
    .array(
      z.object({
        productId: z.string().min(1).max(100),
        variantId: z.string().min(1).max(100).optional(),
        quantity: z.coerce.number().int().min(1).max(99),
        unitPriceOverride: z.coerce
          .number()
          .int()
          .min(1)
          .max(1_000_000)
          .optional(),
        discount: z.coerce.number().int().min(0).max(1_000_000).default(0),
      }),
    )
    .min(1)
    .max(30),
  orderDiscount: z.coerce.number().int().min(0).max(1_000_000).default(0),
  deliveryOverride: z.coerce.number().int().min(0).max(100_000).optional(),
  overrideReason: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['COD', 'UPI']),
  upiStatus: z.enum(['payment_pending', 'payment_received']).optional(),
  source: z.enum(assistedOrderSources),
  attribution: z
    .object({
      campaignId: z.string().trim().max(200).optional(),
      adSetId: z.string().trim().max(200).optional(),
      adId: z.string().trim().max(200).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .default({}),
  customerNotes: z.string().trim().max(500).optional(),
});

type Input = z.infer<typeof assistedOrderInput>;
type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  base_price: number;
  product_type: string;
  stock_mode: string;
  publishing_status: string;
  availability: string;
  active: number;
  estimated_print_minutes: number | null;
  internal_unit_cost: number | null;
};

async function authoritativeItems(db: D1Database, input: Input) {
  const rows = [];
  for (const supplied of input.items) {
    const product = await db
      .prepare(
        `SELECT id,name,sku,base_price,product_type,stock_mode,publishing_status,availability,active,estimated_print_minutes,internal_unit_cost
       FROM products WHERE id=?`,
      )
      .bind(supplied.productId)
      .first<ProductRow>();
    if (
      !product ||
      !product.active ||
      product.publishing_status !== 'published' ||
      product.availability !== 'available'
    )
      throw new CommerceError(
        'A selected product is not currently available for ordering.',
        409,
      );
    const variants = await db
      .prepare(
        `SELECT id,name,sku,price_adjustment,selling_price,finish_id,availability,active
       FROM product_variants WHERE product_id=? AND active=1 ORDER BY sort_order,created_at`,
      )
      .bind(product.id)
      .all<{
        id: string;
        name: string;
        sku: string;
        price_adjustment: number;
        selling_price: number | null;
        finish_id: string | null;
        availability: string;
        active: number;
      }>();
    const variant = supplied.variantId
      ? variants.results.find((value) => value.id === supplied.variantId)
      : undefined;
    if (variants.results.length && !variant)
      throw new CommerceError(
        `Choose an available finish for ${product.name}.`,
        409,
      );
    if (variant && variant.availability !== 'available')
      throw new CommerceError(
        `${variant.name} is not currently available.`,
        409,
      );
    const cataloguePrice =
      variant?.selling_price ??
      product.base_price + (variant?.price_adjustment || 0);
    if (!Number.isSafeInteger(cataloguePrice) || cataloguePrice <= 0)
      throw new CommerceError(
        `${product.name} does not have a valid selling price.`,
        409,
      );
    const unitPrice = supplied.unitPriceOverride ?? cataloguePrice;
    if (supplied.discount >= unitPrice * supplied.quantity)
      throw new CommerceError(
        `The discount for ${product.name} must be less than its line total.`,
      );
    rows.push({
      id: crypto.randomUUID(),
      product,
      variant,
      quantity: supplied.quantity,
      cataloguePrice,
      unitPrice,
      discount: supplied.discount,
      lineTotal: unitPrice * supplied.quantity - supplied.discount,
      overridden: unitPrice !== cataloguePrice || supplied.discount > 0,
    });
  }
  return rows;
}

export async function previewAssistedOrder(db: D1Database, raw: unknown) {
  const input = assistedOrderInput.parse(raw);
  const mobile = normalizeIndianPhone(input.customer.mobile);
  const paymentConfig = await getPaymentConfig(db);
  if (
    (input.paymentMethod === 'COD' && !paymentConfig.codEnabled) ||
    (input.paymentMethod === 'UPI' && !paymentConfig.upiEnabled)
  )
    throw new CommerceError(
      'That payment method is disabled in business settings.',
      409,
    );
  const items = await authoritativeItems(db, input);
  const itemSubtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (input.orderDiscount >= itemSubtotal)
    throw new CommerceError(
      'Order discount must be less than the product subtotal.',
    );
  const subtotal = itemSubtotal - input.orderDiscount;
  const defaults = launchTotals(subtotal);
  const hasOverride =
    items.some((item) => item.overridden) ||
    input.orderDiscount > 0 ||
    (input.deliveryOverride != null &&
      input.deliveryOverride !== defaults.deliveryAmount) ||
    defaults.missing > 0;
  if (hasOverride && !input.overrideReason)
    throw new CommerceError(
      'Add a reason for the price, discount, delivery or minimum-order override.',
    );
  const deliveryAmount = input.deliveryOverride ?? defaults.deliveryAmount;
  const total = subtotal + deliveryAmount;
  const custom = items.some(
    ({ product }) =>
      product.product_type === 'customizable' ||
      product.stock_mode === 'quote_only',
  );
  if (
    custom &&
    (input.paymentMethod !== 'UPI' || input.upiStatus !== 'payment_received')
  )
    throw new CommerceError(
      'Custom or quote-only products require received UPI payment before confirmation.',
      409,
    );
  if (input.paymentMethod === 'UPI' && !input.upiStatus)
    throw new CommerceError(
      'Choose whether UPI payment is pending or received.',
    );
  return {
    input,
    mobile,
    items,
    subtotal,
    deliveryAmount,
    total,
    hasOverride,
    custom,
  };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function createAssistedOrder(db: D1Database, raw: unknown) {
  const preview = await previewAssistedOrder(db, raw);
  const { input, mobile, items, subtotal, deliveryAmount, total } = preview;
  const idem = `admin:${input.idempotencyKey}`;
  const duplicate = await db
    .prepare(
      'SELECT o.id,o.order_number,o.total,o.status,o.payment_status,o.payment_method,o.estimated_delivery_date,c.name customer_name,c.mobile customer_mobile FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.idempotency_key=?',
    )
    .bind(idem)
    .first<{
      id: string;
      order_number: string;
      total: number;
      status: string;
      payment_status: string;
      payment_method: string;
      estimated_delivery_date: string | null;
      customer_name: string;
      customer_mobile: string;
    }>();
  if (duplicate) {
    const trackingToken = randomToken();
    await db
      .prepare(
        'INSERT INTO order_tracking_tokens (id,order_id,token_hash,created_at) VALUES (?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        duplicate.id,
        await sha256(trackingToken),
        new Date().toISOString(),
      )
      .run();
    const savedItems = await db
      .prepare(
        'SELECT product_name name,selected_finish finish,quantity FROM order_items WHERE order_id=? ORDER BY created_at',
      )
      .bind(duplicate.id)
      .all<{ name: string; finish: string | null; quantity: number }>();
    return {
      ...duplicate,
      customerName: duplicate.customer_name,
      customerMobile: duplicate.customer_mobile,
      estimatedDeliveryDate: duplicate.estimated_delivery_date,
      items: savedItems.results,
      trackingToken,
      duplicate: true,
    };
  }

  let customer = await db
    .prepare('SELECT id,name,email FROM customers WHERE mobile=?')
    .bind(mobile)
    .first<{ id: string; name: string; email: string | null }>();
  const email = input.customer.email
    ? normalizeEmail(input.customer.email)
    : null;
  if (!customer && email) {
    const byEmail = await db
      .prepare(
        'SELECT id,name,email,mobile FROM customers WHERE email_normalized=?',
      )
      .bind(email)
      .first<{
        id: string;
        name: string;
        email: string | null;
        mobile: string;
      }>();
    if (byEmail && byEmail.mobile !== mobile)
      throw new CommerceError(
        'That email belongs to a customer with a different mobile number. Verify the customer before continuing.',
        409,
      );
    customer = byEmail || null;
  }
  const isNewCustomer = !customer;
  const customerId = customer?.id || crypto.randomUUID();

  let address: Record<string, unknown> | null = null;
  let adjustedSavedAddress = false;
  if (input.address.savedAddressId) {
    address = await db
      .prepare('SELECT * FROM customer_addresses WHERE id=? AND customer_id=?')
      .bind(input.address.savedAddressId, customerId)
      .first<Record<string, unknown>>();
    if (!address)
      throw new CommerceError(
        'That saved address does not belong to this customer.',
        403,
      );
    const coordinatesMatch =
      address.latitude != null &&
      address.longitude != null &&
      Math.abs(Number(address.latitude) - input.address.latitude) < 0.000001 &&
      Math.abs(Number(address.longitude) - input.address.longitude) < 0.000001;
    if (!coordinatesMatch) {
      input.address.label = String(address.label || 'WhatsApp order');
      address = null;
      adjustedSavedAddress = true;
    }
  }
  const deliveryAddress = address
    ? {
        line1: String(address.line1),
        line2: String(address.line2 || ''),
        locality: String(address.locality),
        city: String(address.city),
        state: String(address.state),
        pinCode: String(address.pin_code),
        landmark: String(address.landmark || ''),
        notes: String(address.notes || ''),
        latitude: Number(address.latitude),
        longitude: Number(address.longitude),
        locationAccuracy:
          address.location_accuracy == null
            ? undefined
            : Number(address.location_accuracy),
      }
    : input.address;
  assertBengaluru(deliveryAddress);

  const orderId = crypto.randomUUID();
  const addressId = address ? String(address.id) : crypto.randomUUID();
  const orderNumber = await createOrderNumber(db);
  const now = new Date().toISOString();
  const paid =
    input.paymentMethod === 'UPI' && input.upiStatus === 'payment_received';
  const orderStatus =
    input.paymentMethod === 'COD' || paid ? 'confirmed' : 'payment_pending';
  const paymentStatus =
    input.paymentMethod === 'COD' ? 'cod' : paid ? 'paid' : 'awaiting_payment';
  const plan =
    orderStatus === 'confirmed'
      ? await planOrder(
          db,
          items.map((item) => ({
            id: item.id,
            quantity: item.quantity,
            estimated_print_minutes: item.product.estimated_print_minutes,
          })),
        )
      : null;
  const trackingToken = randomToken();
  const trackingHash = await sha256(trackingToken);
  const auditMetadata = {
    testMode: input.testMode,
    source: input.source,
    catalogueSubtotal: items.reduce(
      (sum, item) => sum + item.cataloguePrice * item.quantity,
      0,
    ),
    itemDiscounts: items.reduce((sum, item) => sum + item.discount, 0),
    orderDiscount: input.orderDiscount,
    deliveryAmount,
    overrideReason: input.overrideReason || null,
    paymentMethod: input.paymentMethod,
    paymentStatus,
    addressMode: adjustedSavedAddress
      ? 'saved_address_adjusted_as_new_snapshot'
      : input.address.savedAddressId
        ? 'saved_address'
        : 'new_address',
  };
  const statements: D1PreparedStatement[] = [];
  if (isNewCustomer)
    statements.push(
      db
        .prepare(
          'INSERT INTO customers (id,name,mobile,email,email_normalized,auth_method,is_test,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          customerId,
          input.customer.name,
          mobile,
          email,
          email,
          'legacy',
          input.testMode ? 1 : 0,
          now,
          now,
        ),
    );
  if (!address)
    statements.push(
      db
        .prepare(
          'INSERT INTO customer_addresses (id,customer_id,label,line1,line2,locality,city,state,pin_code,landmark,notes,latitude,longitude,location_accuracy,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          addressId,
          customerId,
          input.address.label,
          input.address.line1,
          input.address.line2 || null,
          input.address.locality,
          input.address.city,
          input.address.state,
          input.address.pinCode,
          input.address.landmark || null,
          input.address.notes || null,
          input.address.latitude,
          input.address.longitude,
          input.address.locationAccuracy ?? null,
          now,
          now,
        ),
    );
  statements.push(
    db
      .prepare(
        `INSERT INTO orders (id,order_number,idempotency_key,customer_id,address_id,status,payment_status,payment_method,customer_email,subtotal,delivery_amount,total,customer_notes,latitude,longitude,location_accuracy,estimated_delivery_date,campaign_attribution,source,created_by,admin_discount,override_reason,order_type,is_test,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        orderId,
        orderNumber,
        idem,
        customerId,
        addressId,
        orderStatus,
        paymentStatus,
        input.paymentMethod,
        email || customer?.email || null,
        subtotal,
        deliveryAmount,
        total,
        input.customerNotes || null,
        deliveryAddress.latitude,
        deliveryAddress.longitude,
        deliveryAddress.locationAccuracy ?? null,
        plan?.estimatedDeliveryDate || null,
        JSON.stringify(input.attribution),
        input.source,
        'admin',
        input.orderDiscount +
          items.reduce((sum, item) => sum + item.discount, 0),
        input.overrideReason || null,
        preview.custom ? 'customizable' : 'normal',
        input.testMode ? 1 : 0,
        now,
        now,
      ),
  );
  for (const item of items)
    statements.push(
      db
        .prepare(
          'INSERT INTO order_items (id,order_id,product_id,product_name,product_sku,variant_id,variant_name,selected_finish,quantity,unit_price,line_total,estimated_print_minutes,unit_cost,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          item.id,
          orderId,
          item.product.id,
          item.product.name,
          item.variant?.sku || item.product.sku,
          item.variant?.id || null,
          item.variant?.name || null,
          item.variant?.name || null,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
          item.product.estimated_print_minutes,
          item.product.internal_unit_cost,
          now,
          now,
        ),
    );
  for (const allocation of plan?.allocations || [])
    statements.push(
      db
        .prepare(
          'INSERT INTO production_allocations (id,order_item_id,production_date,minutes) VALUES (?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          allocation.itemId,
          allocation.date,
          allocation.minutes,
        ),
    );
  const timelineId = crypto.randomUUID();
  statements.push(
    db
      .prepare(
        'INSERT INTO order_timeline (id,order_id,to_status,note,actor,created_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        timelineId,
        orderId,
        orderStatus,
        orderStatus === 'confirmed'
          ? `Admin confirmed a ${input.source.replace('_', ' ')} order.`
          : 'Admin saved the order. UPI payment is pending.',
        'admin',
        now,
      ),
    db
      .prepare(
        'INSERT INTO order_tracking_tokens (id,order_id,token_hash,created_at) VALUES (?,?,?,?)',
      )
      .bind(crypto.randomUUID(), orderId, trackingHash, now),
    db
      .prepare(
        'INSERT INTO order_audit_log (id,order_id,action,actor,metadata,created_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        orderId,
        'admin_order_created',
        'admin',
        JSON.stringify(auditMetadata),
        now,
      ),
    db
      .prepare(
        'UPDATE customers SET order_count=order_count+1,last_order_at=?,updated_at=? WHERE id=?',
      )
      .bind(now, now, customerId),
    db
      .prepare(
        'INSERT INTO analytics_events (id,customer_id,name,path,order_id,metadata,is_test,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .bind(
        crypto.randomUUID(),
        customerId,
        'admin_order_created',
        '/admin/orders/create',
        orderId,
        JSON.stringify({
          source: input.source,
          total,
          paymentMethod: input.paymentMethod,
        }),
        input.testMode ? 1 : 0,
        now,
      ),
  );
  await db.batch(statements);
  return {
    id: orderId,
    order_number: orderNumber,
    total,
    status: orderStatus,
    payment_status: paymentStatus,
    payment_method: input.paymentMethod,
    customerId,
    customerName: customer?.name || input.customer.name,
    customerMobile: mobile,
    trackingToken,
    estimatedDeliveryDate: plan?.estimatedDeliveryDate || null,
    items: items.map((item) => ({
      name: item.product.name,
      finish: item.variant?.name || null,
      quantity: item.quantity,
    })),
    duplicate: false,
  };
}

export function assistedWhatsAppMessage(
  order: {
    order_number: string;
    total: number;
    status: string;
    payment_method: string;
    estimatedDeliveryDate?: string | null;
    items: Array<{ name: string; finish: string | null; quantity: number }>;
  },
  trackingUrl: string,
) {
  const confirmed = order.status === 'confirmed';
  return [
    confirmed
      ? '🎉 Your WOW RIGHT order is confirmed!'
      : 'Your WOW RIGHT order has been saved. UPI payment is pending.',
    ...order.items.map(
      (item) =>
        `${item.name}${item.finish ? ` — ${item.finish}` : ''}${item.quantity > 1 ? ` × ${item.quantity}` : ''}`,
    ),
    `₹${order.total.toLocaleString('en-IN')} • ${order.payment_method === 'COD' ? 'Cash on Delivery' : confirmed ? 'UPI received' : 'UPI payment pending'}`,
    `Order: #${order.order_number}`,
    confirmed
      ? 'Your order is now being prepared.'
      : 'We will confirm the order after payment is received.',
    `Track your order: ${trackingUrl}`,
  ].join('\n');
}
