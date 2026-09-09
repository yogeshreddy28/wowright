import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { assertEditableProductJson } from '@/lib/services/product-admin';
import { persist } from '../../route';
import { sameOrigin, safeError, CommerceError } from '@/lib/services/launch-rules';

const requestSchema = z.object({ mode: z.enum(['preview', 'save']), product: z.unknown() });

export async function PUT(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!(await verifyAdmin(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const { productId } = await params;
    const current = await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first<Record<string, unknown>>();
    if (!current) throw new CommerceError('Product not found.', 404);
    const body = requestSchema.parse(await request.json());
    const input = assertEditableProductJson({ ...(body.product as Record<string, unknown>), slugManual: true, skuManual: true });
    const changed = Object.keys(input).filter((key) => {
      const snake = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      return JSON.stringify(input[key as keyof typeof input]) !== JSON.stringify(current[snake]);
    });
    if (body.mode === 'preview') return Response.json({ valid: true, summary: { changedFields: changed, publishingStatus: input.publishingStatus, basePrice: input.basePrice, variants: input.variants.length } });
    const result = await persist(env.DB, input, productId);
    if ('response' in result && result.response) return result.response;
    await env.DB.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), 'product_json_updated', JSON.stringify({ productId, changedFields: changed }), new Date().toISOString()).run();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: 'Product JSON did not pass validation.', errors: error.issues.map((issue) => `${issue.path.join('.') || 'product'}: ${issue.message}`) }, { status: 422 });
    return safeError(error, 'Product JSON could not be saved.');
  }
}
