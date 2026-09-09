import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { durableRateLimit } from '@/lib/rate-limit';
import {
  calculateTrustedPrice,
  estimateTrustedDelivery,
  getAvailableVariants,
  getProductDetails,
  recommendProducts,
  searchProducts,
} from '@/lib/services/companion-tools';
const schema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('searchProducts'),
    query: z.string().max(120).optional(),
  }),
  z.object({
    tool: z.literal('recommendProducts'),
    intent: z.string().max(200).optional(),
  }),
  z.object({
    tool: z.literal('getProductDetails'),
    productId: z.string().max(100),
  }),
  z.object({
    tool: z.literal('getAvailableVariants'),
    productId: z.string().max(100),
  }),
  z.object({
    tool: z.literal('getProductOptions'),
    productId: z.string().max(100),
  }),
  z.object({
    tool: z.literal('calculatePrice'),
    productId: z.string().max(100),
    selections: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
    quantity: z.number().int().min(1).max(99).default(1),
  }),
  z.object({
    tool: z.literal('estimateDelivery'),
    subtotal: z.number().int().nonnegative(),
  }),
]);
export async function POST(r: Request) {
  try {
    const ip = r.headers.get('cf-connecting-ip') || 'local';
    if (!(await durableRateLimit(env.DB, `companion-tools:${ip}`, 40, 60_000)))
      return Response.json({ error: 'Please wait a moment.' }, { status: 429 });
    const d = schema.parse(await r.json());
    let data: unknown;
    if (d.tool === 'searchProducts') data = await searchProducts(d.query);
    else if (d.tool === 'recommendProducts')
      data = await recommendProducts(d.intent);
    else if (d.tool === 'getAvailableVariants')
      data = await getAvailableVariants(d.productId);
    else if (d.tool === 'calculatePrice')
      data = await calculateTrustedPrice(d.productId, d.selections, d.quantity);
    else if (d.tool === 'estimateDelivery')
      data = estimateTrustedDelivery(d.subtotal);
    else {
      const product = await getProductDetails(d.productId);
      data = d.tool === 'getProductOptions' ? product?.options : product;
    }
    return Response.json({ ok: true, data });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'Tool request failed',
      },
      { status: 400 },
    );
  }
}
