import { dispatchMetaInBackground } from '@/lib/services/meta-background';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { sameOrigin } from '@/lib/services/launch-rules';
import { createHashToken } from '@/lib/session-tokens';
const schema = z.object({
  name: z.enum([
    'page_view',
    'product_view',
    'ai_opened',
    'ai_message',
    'add_to_cart',
    'checkout_started',
    'checkout_completed',
    'whatsapp_clicked',
    'custom_quote_submitted',
    'order_created',
    'price_viewed',
    'variant_selected',
    'customization_started',
    'customization_changed',
    'remove_from_cart',
    'cart_view',
    'checkout_validation_error',
    'whatsapp_opened',
    'companion_impression',
    'companion_prompt',
    'companion_hover',
    'companion_opened',
    'companion_closed',
    'companion_dismissed',
    'companion_message',
    'companion_message_sent',
    'companion_quick_reply',
    'companion_recommendation',
    'companion_recommendation_click',
    'product_recommendation_clicked',
    'companion_customization',
    'companion_add_to_cart',
    'companion_checkout_click',
    'companion_checkout_started',
    'companion_checkout_completed',
    'companion_whatsapp_handoff',
    'companion_error',
    'ViewContent',
    'Search',
    'SelectProduct',
    'AddToCart',
    'InitiateCheckout',
    'AddPaymentInfo',
    'Purchase',
    'CODOrderPlaced',
    'UPIWhatsAppHandoff',
    'product_impression',
    'product_click',
    'category_shortcut_click',
    'shop_filter_used',
    'finish_selected',
    'finish_image_viewed',
  ]),
  sessionId: z.string().max(100).optional(),
  path: z.string().max(300).optional(),
  productId: z.string().optional(),
  orderId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  eventId: z.string().uuid().optional(),
  consent: z.boolean().default(false),
});
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    if (
      !rateLimit(
        `analytics:${r.headers.get('cf-connecting-ip') || 'local'}`,
        180,
        60000,
      )
    )
      return Response.json({ ok: false }, { status: 429 });
    const d = schema.parse(await r.json());
    if (
      [
        'Purchase',
        'CODOrderPlaced',
        'order_created',
        'custom_quote_submitted',
      ].includes(d.name)
    )
      return Response.json({ ok: false }, { status: 403 });
    const allowed = [
      'quantity',
      'value',
      'total',
      'price',
      'cartSize',
      'itemCount',
      'paymentMethod',
      'device',
      'returning',
      'dwellSeconds',
      'scrollDepth',
      'category',
      'sort',
      'placement',
      'filter',
      'hasProductImage',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'campaign_id',
      'ad_id',
      'adset_id',
    ];
    const metadata = Object.fromEntries(
      Object.entries(d.metadata || {})
        .filter(
          ([key, value]) =>
            allowed.includes(key) &&
            ['string', 'number', 'boolean'].includes(typeof value) &&
            !/(sk-|bearer|password|api.?key)/i.test(String(value)),
        )
        .map(([key, value]) => [
          key,
          typeof value === 'string' ? value.slice(0, 200) : value,
        ]),
    );
    const eventId = d.eventId || crypto.randomUUID(),
      path = d.path?.split('?')[0] || '/',
      now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO analytics_events (id,session_id,name,path,product_id,order_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(
        eventId,
        d.sessionId || null,
        d.name,
        path,
        d.productId || null,
        null,
        JSON.stringify(metadata),
        now,
      )
      .run();
    if (
      d.consent &&
      d.sessionId &&
      [
        'ViewContent',
        'Search',
        'AddToCart',
        'InitiateCheckout',
        'AddPaymentInfo',
      ].includes(d.name)
    ) {
      const payload = JSON.stringify({
        event_id: eventId,
        event_name: d.name,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        event_source_url:
          (process.env.SITE_URL || 'http://localhost:3000') +
          (path.startsWith('/') && !path.startsWith('//') ? path : '/'),
        user_data: { external_id: [await createHashToken(d.sessionId)] },
        custom_data: {
          currency: 'INR',
          content_ids: d.productId ? [d.productId] : undefined,
        },
        consent: true,
      });
      await env.DB.prepare(
        'INSERT OR IGNORE INTO commerce_outbox(id,event_name,payload,created_at) VALUES(?,?,?,?)',
      )
        .bind(eventId, d.name, payload, now)
        .run();
    }
    dispatchMetaInBackground(env.DB);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
