import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import {
  assistedWhatsAppMessage,
  createAssistedOrder,
  previewAssistedOrder,
} from '@/lib/services/assisted-orders';

function unauthorized() {
  return Response.json(
    { error: 'Your Admin session expired — sign in again.' },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return unauthorized();
  const url = new URL(request.url);
  const mobileInput = url.searchParams.get('mobile');
  if (mobileInput) {
    try {
      const mobile = normalizeIndianPhone(mobileInput);
      const customer = await env.DB.prepare(
        'SELECT id,name,mobile,email,order_count,last_order_at FROM customers WHERE mobile=?',
      )
        .bind(mobile)
        .first<Record<string, unknown>>();
      if (!customer)
        return Response.json({ customer: null, normalizedMobile: mobile });
      const [addresses, orders] = await env.DB.batch([
        env.DB.prepare(
          'SELECT id,label,line1,line2,locality,city,state,pin_code,landmark,notes,latitude,longitude,location_accuracy,is_default FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC,updated_at DESC',
        ).bind(customer.id),
        env.DB.prepare(
          'SELECT order_number,status,total,created_at FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 5',
        ).bind(customer.id),
      ]);
      return Response.json({
        customer: {
          ...customer,
          addresses: addresses.results,
          pastOrders: orders.results,
        },
        normalizedMobile: mobile,
      });
    } catch (error) {
      return safeError(error);
    }
  }
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const like = `%${q}%`;
  const products = await env.DB.prepare(
    `SELECT p.id,p.name,p.sku,p.base_price,p.product_type,p.stock_mode,p.lead_time,
      (SELECT '/api/product-images/'||pi.id FROM product_images pi WHERE pi.product_id=p.id ORDER BY CASE pi.role WHEN 'main' THEN 0 ELSE 1 END,pi.sort_order LIMIT 1) image
     FROM products p WHERE p.active=1 AND p.publishing_status='published' AND p.availability='available'
       AND (?='' OR p.name LIKE ? OR COALESCE(p.sku,'') LIKE ?)
     ORDER BY p.name LIMIT 30`,
  )
    .bind(q, like, like)
    .all<Record<string, unknown>>();
  const productIds = products.results.map((row) => String(row.id));
  let variants: Record<string, unknown>[] = [];
  if (productIds.length) {
    const marks = productIds.map(() => '?').join(',');
    variants = (
      await env.DB.prepare(
        `SELECT v.id,v.product_id,COALESCE(f.name,v.name) name,v.sku,v.selling_price,v.price_adjustment,v.availability
       FROM product_variants v LEFT JOIN global_finishes f ON f.id=v.finish_id
       WHERE v.product_id IN (${marks}) AND v.active=1 AND v.availability='available' ORDER BY v.sort_order,v.created_at`,
      )
        .bind(...productIds)
        .all<Record<string, unknown>>()
    ).results;
  }
  return Response.json({
    products: products.results.map((product) => ({
      ...product,
      variants: variants.filter((variant) => variant.product_id === product.id),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) return unauthorized();
  try {
    sameOrigin(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === 'preview') {
      const result = await previewAssistedOrder(env.DB, body.order);
      return Response.json({
        customer: {
          name: result.input.customer.name,
          mobile: result.mobile,
          email: result.input.customer.email || null,
        },
        items: result.items.map((item) => ({
          productId: item.product.id,
          name: item.product.name,
          sku: item.variant?.sku || item.product.sku,
          variant: item.variant?.name || null,
          quantity: item.quantity,
          cataloguePrice: item.cataloguePrice,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal,
        })),
        subtotal: result.subtotal,
        deliveryAmount: result.deliveryAmount,
        total: result.total,
        paymentMethod: result.input.paymentMethod,
        paymentStatus:
          result.input.paymentMethod === 'COD' ? 'cod' : result.input.upiStatus,
        source: result.input.source,
        estimatedDelivery: 'Calculated when the order is confirmed',
        hasOverride: result.hasOverride,
      });
    }
    if (body.action !== 'create')
      throw new CommerceError('Choose Preview or Create order.');
    const order = await createAssistedOrder(env.DB, body.order);
    const baseUrl = process.env.SITE_URL || new URL(request.url).origin;
    const trackingUrl = `${baseUrl.replace(/\/$/, '')}/track/${order.trackingToken}`;
    const message = assistedWhatsAppMessage(order, trackingUrl);
    const number = order.customerMobile;
    return Response.json(
      {
        order: { ...order, trackingToken: undefined },
        trackingUrl,
        whatsappMessage: message,
        whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return safeError(
      error,
      'The assisted order could not be created. No order was saved.',
    );
  }
}
