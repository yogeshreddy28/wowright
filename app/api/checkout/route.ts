import { dispatchMetaInBackground } from '@/lib/services/meta-background';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  checkoutItems,
  verifyCheckoutCart,
} from '@/lib/services/checkout-cart';
import { getPaymentConfig } from '@/lib/services/delivery';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { createOrderNumber, getCheckoutOutcome } from '@/lib/services/orders';
import { createUPIPaymentURL } from '@/lib/services/whatsapp';
import { durableRateLimit } from '@/lib/rate-limit';
import {
  createOrderAccess,
  getCustomerFromRequest,
} from '@/lib/customer-auth';
import {
  assertBengaluru,
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { planOrder } from '@/lib/services/production';
import { prepareCommerceEvent } from '@/lib/services/tracking';

export const checkoutAddress = z
  .object({
    addressId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(100),
    mobile: z.string(),
    email: z
      .union([z.string().trim().email(), z.literal('')])
      .optional(),
    line1: z.string().trim().min(3).max(200),
    line2: z.string().max(200).optional(),
    locality: z.string().trim().min(2).max(100),
    city: z.string().trim().max(100),
    state: z.string().trim().max(100),
    pinCode: z.string().regex(/^560\d{3}$/),
    landmark: z.string().max(150).optional(),
    notes: z.string().max(500).optional(),
    latitude: z.coerce.number().finite(),
    longitude: z.coerce.number().finite(),
    locationAccuracy: z.coerce.number().finite().min(0).max(100000).optional(),
    labelType: z.enum(['Home', 'Work', 'Friend / Family', 'Custom']).optional(),
    customLabel: z.string().trim().max(40).optional(),
  })
  .superRefine((value, context) => {
    if (!value.addressId && value.labelType === 'Custom' && !value.customLabel)
      context.addIssue({
        code: 'custom',
        message: 'Enter a name for this address.',
      });
  });
const schema = z.object({
  sessionId: z.string().uuid(),
  paymentMethod: z.enum(['COD', 'UPI']),
  customer: checkoutAddress,
  items: checkoutItems,
  companion: z
    .object({
      engaged: z.boolean().optional(),
      assistedCart: z.boolean().optional(),
      assistedCheckout: z.boolean().optional(),
      campaign: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  analyticsConsent: z.boolean().default(false),
});
type Saved = {
  id: string;
  order_number: string;
  payment_method: 'COD' | 'UPI';
  total: number;
  checkout_fingerprint: string;
  status: string;
};
function savedResponse(
  row: Saved,
  duplicate = false,
  accessCookie?: string,
) {
  return Response.json(
    {
      orderNumber: row.order_number,
      paymentMethod: row.payment_method,
      status: row.status,
      duplicate,
      url:
        row.payment_method === 'UPI'
          ? createUPIPaymentURL({
              orderNumber: row.order_number,
              total: row.total,
            })
          : undefined,
    },
    accessCookie ? { headers: { 'Set-Cookie': accessCookie } } : undefined,
  );
}

export async function POST(request: Request) {
  const db = env.DB;
  let idem = '',
    fingerprint = '',
    guestCheckout = false;
  try {
    sameOrigin(request);
    const key = request.headers.get('Idempotency-Key');
    if (!key || !/^[\w-]{8,100}$/.test(key))
      throw new CommerceError('Missing checkout safety key.');
    const data = schema.parse(await request.json());
    if (
      !(await durableRateLimit(
        env.DB,
        'checkout:' + data.sessionId,
        12,
        60_000,
      ))
    )
      throw new CommerceError('Please wait a minute before trying again.', 429);
    const account = await getCustomerFromRequest(request, db);
    const mobile = normalizeIndianPhone(data.customer.mobile);
    if (account && mobile !== account.mobile)
      throw new CommerceError('Use the phone number linked to your account.');
    if (
      account?.email &&
      data.customer.email &&
      data.customer.email.trim().toLowerCase() !==
        account.email.trim().toLowerCase()
    )
      throw new CommerceError('Use the verified email linked to your account.');
    const existingCustomer = account
      ? null
      : await db
          .prepare(
            'SELECT id,email,auth_method FROM customers WHERE mobile=? LIMIT 1',
          )
          .bind(mobile)
          .first<{
            id: string;
            email: string | null;
            auth_method: string;
          }>();
    const customerId =
      account?.id || existingCustomer?.id || crypto.randomUUID();
    const customerEmail = account?.email || data.customer.email || null;
    const createGuestCustomer = !account && !existingCustomer;
    guestCheckout = !account;
    idem = customerId + ':' + key;
    if (account && !data.customer.addressId && !data.customer.labelType)
      throw new CommerceError('Choose how to save this address.');
    if (!account && data.customer.addressId)
      throw new CommerceError('Sign in to use a saved address.', 403);
    let selectedAddress: Record<string, unknown> | null = null;
    if (data.customer.addressId) {
      selectedAddress = await db
        .prepare(
          'SELECT id,line1,line2,locality,city,state,pin_code,landmark,latitude,longitude,location_accuracy FROM customer_addresses WHERE id=? AND customer_id=?',
        )
        .bind(data.customer.addressId, account!.id)
        .first<Record<string, unknown>>();
      if (!selectedAddress)
        throw new CommerceError(
          'That saved address is no longer available.',
          404,
        );
      if (selectedAddress.latitude == null || selectedAddress.longitude == null)
        throw new CommerceError(
          'Add a map pin to this saved address before using it for delivery.',
        );
      Object.assign(data.customer, {
        line1: selectedAddress.line1,
        line2: selectedAddress.line2 || '',
        locality: selectedAddress.locality,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pinCode: selectedAddress.pin_code,
        landmark: selectedAddress.landmark || '',
        latitude: selectedAddress.latitude,
        longitude: selectedAddress.longitude,
        locationAccuracy: selectedAddress.location_accuracy,
      });
    }
    assertBengaluru(data.customer);
    fingerprint = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(
            JSON.stringify({
              items: data.items,
              customer: data.customer,
              method: data.paymentMethod,
            }),
          ),
        ),
      ),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const existing = await db
      .prepare(
        'SELECT id,order_number,payment_method,total,checkout_fingerprint,status FROM orders WHERE idempotency_key=? AND customer_id=?',
      )
      .bind(idem, customerId)
      .first<Saved>();
    if (existing) {
      if (existing.checkout_fingerprint !== fingerprint)
        throw new CommerceError(
          'This checkout was already saved with different details. Review the saved order before starting another checkout.',
          409,
        );
      return savedResponse(
        existing,
        true,
        guestCheckout ? await createOrderAccess(db, existing.id) : undefined,
      );
    }
    const payment = await getPaymentConfig(db);
    if (
      data.paymentMethod === 'COD' ? !payment.codEnabled : !payment.upiEnabled
    )
      throw new CommerceError(
        'That payment method is not currently available.',
        409,
      );
    const { verified, totals } = await verifyCheckoutCart(db, data.items);
    const id = crypto.randomUUID(),
      newAddressId = crypto.randomUUID(),
      orderNumber = await createOrderNumber(db),
      now = new Date().toISOString();
    const outcome = getCheckoutOutcome(data.paymentMethod);
    const plan =
      data.paymentMethod === 'COD'
        ? await planOrder(
            db,
            verified.map((i) => ({
              id: i.id,
              quantity: i.quantity,
              estimated_print_minutes:
                i.internal?.estimated_print_minutes ?? null,
            })),
          )
        : null;
    const campaign = Object.fromEntries(
      Object.entries(data.companion?.campaign || {})
        .filter(
          ([k, v]) =>
            [
              'utm_source',
              'utm_medium',
              'utm_campaign',
              'utm_content',
              'utm_term',
              'campaign_id',
              'ad_id',
              'adset_id',
              'fbclid',
            ].includes(k) && typeof v === 'string',
        )
        .map(([k, v]) => [k, String(v).slice(0, 200)]),
    );
    let addressId = newAddressId;
    const statements: D1PreparedStatement[] = [];
    if (createGuestCustomer)
      statements.push(
        db
          .prepare(
            "INSERT INTO customers (id,name,mobile,email,email_normalized,email_verified_at,auth_method,account_claim_pending,order_count,total_spent,created_at,updated_at) VALUES (?,?,?,?,NULL,NULL,'guest',1,0,0,?,?)",
          )
          .bind(
            customerId,
            data.customer.name,
            mobile,
            data.customer.email || null,
            now,
            now,
          ),
      );
    if (selectedAddress) {
      addressId = String(selectedAddress.id);
    } else
      statements.push(
        db
          .prepare(
            'INSERT INTO customer_addresses (id,customer_id,label,line1,line2,locality,city,state,pin_code,landmark,notes,latitude,longitude,location_accuracy,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            addressId,
            customerId,
            !account
              ? 'Order delivery'
              : data.customer.labelType === 'Custom'
              ? data.customer.customLabel!
              : data.customer.labelType!,
            data.customer.line1,
            data.customer.line2 || null,
            data.customer.locality,
            data.customer.city,
            data.customer.state,
            data.customer.pinCode,
            data.customer.landmark || null,
            data.customer.notes || null,
            data.customer.latitude,
            data.customer.longitude,
            data.customer.locationAccuracy ?? null,
            now,
            now,
          ),
      );
    statements.push(
      db
        .prepare(
          'INSERT INTO orders (id,order_number,idempotency_key,checkout_fingerprint,session_id,customer_id,address_id,status,payment_status,payment_method,customer_email,subtotal,delivery_amount,total,customer_notes,latitude,longitude,location_accuracy,estimated_delivery_date,campaign_attribution,companion_engaged,companion_assisted_cart,companion_assisted_checkout,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          orderNumber,
          idem,
          fingerprint,
          data.sessionId,
          customerId,
          addressId,
          outcome.orderStatus,
          outcome.paymentStatus,
          data.paymentMethod,
          customerEmail,
          totals.subtotal,
          totals.deliveryAmount,
          totals.total,
          data.customer.notes || null,
          data.customer.latitude,
          data.customer.longitude,
          data.customer.locationAccuracy ?? null,
          plan?.estimatedDeliveryDate || null,
          JSON.stringify({
            ...campaign,
            analyticsConsent: data.analyticsConsent,
          }),
          Number(data.companion?.engaged || false),
          Number(data.companion?.assistedCart || false),
          Number(data.companion?.assistedCheckout || false),
          now,
          now,
        ),
    );
    for (const item of verified) {
      statements.push(
        db
          .prepare(
            'INSERT INTO order_items (id,order_id,product_id,product_name,product_sku,variant_id,variant_name,selected_finish,selected_height,calculated_width,calculated_depth,size_scale,size_price_band_id,size_pricing_version,size_dimension_unit,quantity,unit_price,line_total,estimated_print_minutes,unit_cost,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
          )
          .bind(
            item.id,
            id,
            item.product.id,
            item.product.name,
            item.internal?.sku || null,
            item.variant?.id || null,
            item.variant?.name || null,
            item.variant?.name || null,
            item.sizing?.selectedHeight ?? null,
            item.sizing?.width ?? null,
            item.sizing?.depth ?? null,
            item.sizing?.scale ?? null,
            item.sizing?.pricingBandId ?? null,
            item.sizing?.pricingVersion ?? null,
            item.sizing?.dimensionUnit ?? null,
            item.quantity,
            item.unitPrice,
            item.quantity * item.unitPrice,
            item.internal?.estimated_print_minutes ?? null,
            item.internal?.internal_unit_cost ?? null,
            now,
            now,
          ),
      );
      if (item.fixedSize)
        statements.push(
          db
            .prepare(
              'UPDATE order_items SET fixed_size_id=?,fixed_size_label=?,selected_height=?,size_dimension_unit=?,filament_grams=? WHERE id=?',
            )
            .bind(
              item.fixedSize.id,
              item.fixedSize.label,
              item.fixedSize.heightCm,
              'cm',
              item.internal?.filament_grams ?? null,
              item.id,
            ),
        );
      for (const [key, value] of Object.entries(item.selections))
        statements.push(
          db
            .prepare(
              'INSERT INTO order_item_customizations (id,order_item_id,option_key,option_name,value,price_adjustment,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              item.id,
              key,
              item.product.options.find((o) => o.key === key)?.name || key,
              String(value),
              item.adjustments[key] || 0,
              now,
              now,
            ),
        );
      if (item.sizing) {
        const unit = item.sizing.dimensionUnit;
        for (const [key, name, value] of [
          [
            'selected_height',
            'Custom height',
            `${item.sizing.selectedHeight} ${unit}`,
          ],
          [
            'calculated_width',
            'Calculated width',
            `${item.sizing.width} ${unit}`,
          ],
          [
            'calculated_depth',
            'Calculated depth',
            `${item.sizing.depth} ${unit}`,
          ],
          [
            'size_scale',
            'Model scale',
            `${Math.round(item.sizing.scale * 10_000) / 100}%`,
          ],
        ])
          statements.push(
            db
              .prepare(
                'INSERT INTO order_item_customizations (id,order_item_id,option_key,option_name,value,price_adjustment,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
              )
              .bind(crypto.randomUUID(), item.id, key, name, value, now, now),
          );
      }
      if (item.fixedSize)
        statements.push(
          db
            .prepare(
              'INSERT INTO order_item_customizations (id,order_item_id,option_key,option_name,value,price_adjustment,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?)',
            )
            .bind(
              crypto.randomUUID(),
              item.id,
              'fixed_size',
              'Size',
              `${item.fixedSize.label} — ${item.fixedSize.heightCm} cm`,
              now,
              now,
            ),
        );
    }
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
    statements.push(
      db
        .prepare(
          'INSERT INTO order_timeline (id,order_id,to_status,note,actor,created_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          id,
          outcome.orderStatus,
          data.paymentMethod === 'COD'
            ? 'COD order confirmed on the website.'
            : 'Order saved. UPI payment is pending.',
          'system',
          now,
        ),
      db
        .prepare(
          'UPDATE customers SET order_count=order_count+1,last_order_at=?,updated_at=? WHERE id=?',
        )
        .bind(now, now, customerId),
    );
    for (const event of [
      'order_created',
      data.paymentMethod === 'COD' ? 'CODOrderPlaced' : 'UPIOrderPending',
    ])
      statements.push(
        db
          .prepare(
            'INSERT INTO analytics_events (id,session_id,customer_id,name,path,order_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)',
          )
          .bind(
            id + ':' + event,
            data.sessionId,
            customerId,
            event,
            '/checkout',
            id,
            JSON.stringify({
              total: totals.total,
              paymentMethod: data.paymentMethod,
              ...campaign,
            }),
            now,
          ),
      );
    const conversation = await db
      .prepare(
        'SELECT c.id FROM conversations c JOIN sessions s ON s.id=c.session_id WHERE c.session_id=? AND s.customer_id=? ORDER BY c.updated_at DESC LIMIT 1',
      )
      .bind(data.sessionId, customerId)
      .first<{ id: string }>();
    if (conversation)
      statements.push(
        db
          .prepare('UPDATE orders SET conversation_id=? WHERE id=?')
          .bind(conversation.id, id),
      );
    statements.push(
      ...(
        await prepareCommerceEvent(
          db,
          { id, total: totals.total, session_id: data.sessionId, is_test: 0 },
          data.paymentMethod === 'COD' ? 'CODOrderPlaced' : 'UPIOrderPending',
          data.analyticsConsent,
        )
      )(),
    );
    await db.batch(statements);
    dispatchMetaInBackground(db);
    const responseRow = {
      id,
      order_number: orderNumber,
      payment_method: data.paymentMethod,
      total: totals.total,
      checkout_fingerprint: fingerprint,
      status: outcome.orderStatus,
    };
    return savedResponse(
      responseRow,
      false,
      guestCheckout ? await createOrderAccess(db, id) : undefined,
    );
  } catch (error) {
    if (idem && fingerprint) {
      const saved = await db
        .prepare(
          'SELECT id,order_number,payment_method,total,checkout_fingerprint,status FROM orders WHERE idempotency_key=?',
        )
        .bind(idem)
        .first<Saved>()
        .catch(() => null);
      if (saved?.checkout_fingerprint === fingerprint)
        return savedResponse(
          saved,
          true,
          guestCheckout ? await createOrderAccess(db, saved.id) : undefined,
        );
    }
    if (
      error instanceof Error &&
      /^(Invalid|Choose a finish|.+ is required|A product is no longer available)/.test(
        error.message,
      )
    )
      return safeError(new CommerceError(error.message, 409));
    return safeError(
      error,
      'We could not save your order. Your cart is still safe.',
    );
  }
}
