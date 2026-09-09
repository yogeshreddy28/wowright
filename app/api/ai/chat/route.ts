import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { AI_UNAVAILABLE_MESSAGE } from '@/lib/services/ai';
import { getAIProvider } from '@/lib/services/ai-runtime';
import { durableRateLimit } from '@/lib/rate-limit';
import { classifyObjection } from '@/lib/companion/objections';
import {
  calculateTrustedPrice,
  recommendProducts,
} from '@/lib/services/companion-tools';
const schema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().min(8).max(100),
  path: z.string().optional(),
  cart: z.unknown().optional(),
  history: z.array(z.unknown()).max(30).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});
function topic(message: string) {
  if (/deliver|shipping|arrive|how long/i.test(message)) return 'delivery';
  if (/pay|upi|cod|cash/i.test(message)) return 'payment';
  return 'general';
}
export async function POST(r: Request) {
  try {
    const d = schema.parse(await r.json());
    if (
      !(await durableRateLimit(
        env.DB,
        `ai-ip:${r.headers.get('cf-connecting-ip') || 'local'}`,
        40,
        60000,
      )) ||
      !(await durableRateLimit(env.DB, `ai:${d.sessionId}`, 20, 60_000))
    )
      return Response.json(
        {
          message:
            'Let’s pause for a moment. You can keep shopping or talk to us on WhatsApp.',
          provider: 'fallback',
        },
        { status: 429 },
      );
    let conversation = await env.DB.prepare(
      "SELECT id FROM conversations WHERE session_id=? AND channel='web' AND status='open' ORDER BY created_at DESC LIMIT 1",
    )
      .bind(d.sessionId)
      .first<{ id: string }>();
    const now = new Date().toISOString();
    if (!conversation) {
      conversation = { id: crypto.randomUUID() };
      await env.DB.prepare(
        'INSERT INTO conversations (id,session_id,channel,status,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(conversation.id, d.sessionId, 'web', 'open', now, now)
        .run();
    }
    const objection = classifyObjection(d.message);
    await env.DB.prepare(
      'INSERT INTO conversation_messages (id,conversation_id,role,message,metadata,created_at) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        conversation.id,
        'customer',
        d.message,
        JSON.stringify({ objection, topic: topic(d.message) }),
        now,
      )
      .run();
    const provider = await getAIProvider();
    const configured = await provider.healthCheck();
    let message = AI_UNAVAILABLE_MESSAGE;
    let action: unknown;
    let quickReplies = [
      'Show me products',
      'I have my own idea',
      'Talk to a person',
    ];
    if (/add.*cart|put.*cart/i.test(d.message)) {
      const current = d.context?.currentProduct as { id?: string } | undefined;
      const selections = (d.context?.selectedOptions || {}) as Record<
        string,
        string | number | boolean
      >;
      if (current?.id) {
        try {
          const priced = await calculateTrustedPrice(current.id, selections, 1);
          message = `Please confirm before I add ${priced.product.name} to your cart at the verified price.`;
          action = { type: 'confirm_add_to_cart', ...priced };
          quickReplies = ['Keep shopping', 'Go to checkout'];
        } catch {
          message =
            'Please finish the required product options first. I will use the verified catalog price when you are ready.';
        }
      } else {
        message =
          'Open a product and choose its options first, then I can prepare it for your cart.';
      }
    } else if (/choose|recommend|show.*product|gift/i.test(d.message)) {
      const products = await recommendProducts(d.message);
      message = configured
        ? 'Here are a few options from the current WOW RIGHT catalog.'
        : 'The AI assistant is currently unavailable, but I can still show you products from the verified catalog.';
      action = { type: 'recommendations', products };
      quickReplies = [
        'Which one can I personalize?',
        'I have my own idea',
        'How does delivery work?',
      ];
    } else if (
      /own idea|custom print|my design|sketch|model/i.test(d.message)
    ) {
      message =
        'Great—tell me what you want to make, the approximate size, quantity, preferred colour, and whether you have a photo or model. The custom request form will save the details for review.';
      action = { type: 'open_custom_quote' };
      quickReplies = [
        'Open custom request',
        'What files can I upload?',
        'Talk to a person',
      ];
    } else if (/payment|upi|cod|cash/i.test(d.message)) {
      message =
        'At checkout, your order is saved first. You then continue on WhatsApp to choose UPI or Cash on Delivery and receive confirmation. Opening WhatsApp does not mark the order paid.';
      quickReplies = ['Go to checkout', 'Talk to a person'];
    } else if (/deliver|shipping|arrive|how long/i.test(d.message)) {
      message =
        'Product lead times come from the current catalog. Final delivery timing is confirmed on WhatsApp after your order details and area are reviewed.';
      quickReplies = ['Show my cart', 'Talk to a person'];
    } else if (configured)
      try {
        message = await provider.generate({
          message: d.message,
          context: {
            path: d.path,
            cart: d.cart,
            history: d.history,
            product: d.context?.currentProduct,
          },
        });
      } catch {}
    await env.DB.prepare(
      'INSERT INTO conversation_messages (id,conversation_id,role,message,metadata,created_at) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        conversation.id,
        'assistant',
        message,
        JSON.stringify({
          provider: configured ? 'configured' : 'fallback',
          objection,
          action,
        }),
        new Date().toISOString(),
      )
      .run();
    await env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=?')
      .bind(new Date().toISOString(), conversation.id)
      .run();
    return Response.json({
      message,
      conversationId: conversation.id,
      quickReplies,
      action,
      objection,
      provider: configured ? 'configured' : 'fallback',
    });
  } catch {
    return Response.json(
      { message: AI_UNAVAILABLE_MESSAGE, provider: 'fallback' },
      { status: 400 },
    );
  }
}
