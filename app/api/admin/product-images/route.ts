import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { validateImage } from '@/lib/services/image-upload';
import { CommerceError, safeError } from '@/lib/services/launch-rules';

type ImageRow = {
  id: string;
  product_id: string | null;
  global_finish_id: string | null;
  storage_key: string;
  role: string;
};
async function imageRow(id: string) {
  const row = await env.DB.prepare('SELECT * FROM product_images WHERE id=?')
    .bind(id)
    .first<ImageRow>();
  if (!row) throw new CommerceError('Image not found.', 404);
  return row;
}
async function assertCanRemoveMain(image: ImageRow) {
  if (!image.product_id || image.role !== 'main') return;
  const product = await env.DB.prepare(
    'SELECT publishing_status,images FROM products WHERE id=?',
  )
    .bind(image.product_id)
    .first<{ publishing_status: string; images: string }>();
  if (
    product?.publishing_status === 'published' &&
    !JSON.parse(product.images || '[]').length
  )
    throw new CommerceError(
      'Set another main image or unpublish the product before removing its main image.',
      409,
    );
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let uploadedKey: string | undefined;
  try {
    const form = await request.formData(),
      file = form.get('file');
    if (!(file instanceof File))
      throw new CommerceError('Choose an image to upload.');
    const contentType = await validateImage(file);
    const productId = String(form.get('productId') || '') || null,
      globalFinishId = String(form.get('globalFinishId') || '') || null;
    if (Boolean(productId) === Boolean(globalFinishId))
      throw new CommerceError('Choose one product or global finish.');
    const role = globalFinishId
      ? 'finish_reference'
      : z
          .enum(['main', 'gallery'])
          .parse(String(form.get('role') || 'gallery'));
    if (
      productId &&
      !(await env.DB.prepare('SELECT id FROM products WHERE id=?')
        .bind(productId)
        .first())
    )
      throw new CommerceError('Product not found.', 404);
    if (
      globalFinishId &&
      !(await env.DB.prepare('SELECT id FROM global_finishes WHERE id=?')
        .bind(globalFinishId)
        .first())
    )
      throw new CommerceError('Finish not found.', 404);
    const count = await env.DB.prepare(
      'SELECT COUNT(*) count FROM product_images WHERE product_id IS ? AND global_finish_id IS ?',
    )
      .bind(productId, globalFinishId)
      .first<{ count: number }>();
    if (Number(count?.count || 0) >= 12)
      throw new CommerceError('A product or finish can have up to 12 images.');
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120),
      id = crypto.randomUUID();
    const key = `catalog/${productId || 'finish-' + globalFinishId}/${id}-${safe}`;
    await env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType },
      customMetadata: { originalName: safe },
    });
    uploadedKey = key;
    const now = new Date().toISOString(),
      statements: D1PreparedStatement[] = [];
    if (role === 'main')
      statements.push(
        env.DB.prepare(
          "UPDATE product_images SET role='gallery' WHERE product_id=? AND role='main'",
        ).bind(productId),
      );
    statements.push(
      env.DB.prepare(
        'INSERT INTO product_images(id,product_id,global_finish_id,storage_key,original_name,content_type,size,role,alt_text,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(sort_order)+1 FROM product_images WHERE product_id IS ? AND global_finish_id IS ?),0),?,?)',
      ).bind(
        id,
        productId,
        globalFinishId,
        key,
        safe,
        contentType,
        file.size,
        role,
        String(form.get('altText') || '').slice(0, 300) || null,
        productId,
        globalFinishId,
        now,
        now,
      ),
    );
    if (globalFinishId)
      statements.push(
        env.DB.prepare(
          'UPDATE global_finishes SET reference_image_id=?,updated_at=? WHERE id=?',
        ).bind(id, now, globalFinishId),
      );
    await env.DB.batch(statements);
    uploadedKey = undefined;
    return Response.json({ id, url: `/api/product-images/${id}` });
  } catch (error) {
    if (uploadedKey) await env.FILES.delete(uploadedKey).catch(() => {});
    return safeError(error, 'The image could not be saved. Please try again.');
  }
}
export async function PATCH(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = z
      .object({
        id: z.string().min(1),
        role: z.enum(['main', 'gallery']).optional(),
        sortOrder: z.number().int().min(0).max(1000).optional(),
      })
      .parse(await request.json());
    const image = await imageRow(data.id);
    if (data.role && !image.product_id)
      throw new CommerceError('Global images are finish references.');
    if (data.role === 'gallery') await assertCanRemoveMain(image);
    const statements: D1PreparedStatement[] = [];
    if (data.role === 'main')
      statements.push(
        env.DB.prepare(
          "UPDATE product_images SET role='gallery' WHERE product_id=? AND role='main'",
        ).bind(image.product_id),
      );
    statements.push(
      env.DB.prepare(
        'UPDATE product_images SET role=COALESCE(?,role),sort_order=COALESCE(?,sort_order),updated_at=? WHERE id=?',
      ).bind(
        data.role || null,
        data.sortOrder ?? null,
        new Date().toISOString(),
        data.id,
      ),
    );
    await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error, 'The image could not be updated.');
  }
}
export async function DELETE(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const id = z
      .string()
      .min(1)
      .parse(new URL(request.url).searchParams.get('id'));
    const image = await imageRow(id);
    await assertCanRemoveMain(image);
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE global_finishes SET reference_image_id=NULL,updated_at=? WHERE reference_image_id=?',
      ).bind(new Date().toISOString(), id),
      env.DB.prepare(
        'UPDATE product_variants SET exact_image_id=NULL WHERE exact_image_id=?',
      ).bind(id),
      env.DB.prepare('DELETE FROM product_images WHERE id=?').bind(id),
    ]);
    // Duplicates can share immutable R2 objects. Retain unreferenced objects for
    // a separate audited garbage-collection job, rather than risking broken copies.
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error, 'The image could not be removed.');
  }
}
