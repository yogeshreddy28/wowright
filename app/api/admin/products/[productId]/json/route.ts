import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  canonicalProductJson,
  loadProductJsonState,
  normalizeProductJson,
  productImageCount,
  validateProductFinishRelations,
  validateProductForPublish,
} from '@/lib/services/product-admin';
import { persist } from '../../route';
import {
  sameOrigin,
  safeError,
  CommerceError,
} from '@/lib/services/launch-rules';

const requestSchema = z.object({
  mode: z.enum(['preview', 'save']),
  product: z.unknown(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { productId } = await params;
  const state = await loadProductJsonState(env.DB, productId);
  if (!state)
    return Response.json({ error: 'Product not found.' }, { status: 404 });
  return Response.json({ product: canonicalProductJson(state) });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const { productId } = await params;
    const current = await loadProductJsonState(env.DB, productId);
    if (!current) throw new CommerceError('Product not found.', 404);
    const body = requestSchema.parse(await request.json());
    const normalized = normalizeProductJson(body.product, current);
    const input = normalized.input;
    await validateProductFinishRelations(env.DB, input, productId);
    if (input.publishingStatus === 'published') {
      const errors = validateProductForPublish(
        input,
        await productImageCount(env.DB, productId),
      );
      if (errors.length)
        return Response.json(
          { error: 'Product is not ready to publish.', errors },
          { status: 422 },
        );
    }
    if (body.mode === 'preview')
      return Response.json({
        valid: true,
        product: normalized.document,
        warnings: normalized.warnings,
        summary: {
          changedFields: normalized.changedFields,
          publishingStatus: input.publishingStatus,
          basePrice: input.basePrice,
          variants: input.variants.length,
        },
      });
    const result = await persist(env.DB, input, productId);
    if ('response' in result && result.response) return result.response;
    await env.DB.prepare(
      'INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        'product_json_updated',
        JSON.stringify({
          productId,
          changedFields: normalized.changedFields,
          warningCount: normalized.warnings.length,
        }),
        new Date().toISOString(),
      )
      .run();
    const saved = await loadProductJsonState(env.DB, productId);
    if (!saved)
      throw new CommerceError('Saved product could not be reloaded.', 500);
    return Response.json({
      ok: true,
      ...result,
      product: canonicalProductJson(saved),
      warnings: normalized.warnings,
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: 'Product JSON did not pass validation.',
          errors: error.issues.map(
            (issue) => `${issue.path.join('.') || 'product'}: ${issue.message}`,
          ),
        },
        { status: 422 },
      );
    return safeError(error, 'Product JSON could not be saved.');
  }
}
