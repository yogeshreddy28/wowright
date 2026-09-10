import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { productId } = await params;
  const [product, variants, images, tags, related] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId),
    env.DB.prepare(
      'SELECT v.*,(SELECT json_group_array(pvi.image_id) FROM product_variant_images pvi WHERE pvi.variant_id=v.id ORDER BY pvi.sort_order) exact_image_ids FROM product_variants v WHERE v.product_id=? ORDER BY v.sort_order,v.created_at',
    ).bind(productId),
    env.DB.prepare(
      "SELECT *,'/api/product-images/'||id url FROM product_images WHERE product_id=? ORDER BY CASE role WHEN 'main' THEN 0 ELSE 1 END,sort_order",
    ).bind(productId),
    env.DB.prepare(
      'SELECT t.name FROM tags t JOIN product_tags pt ON pt.tag_id=t.id WHERE pt.product_id=? ORDER BY t.name',
    ).bind(productId),
    env.DB.prepare(
      'SELECT related_product_id FROM related_products WHERE product_id=? ORDER BY sort_order',
    ).bind(productId),
  ]);
  const row = product.results[0] as Record<string, unknown> | undefined;
  if (!row)
    return Response.json({ error: 'Product not found.' }, { status: 404 });
  return Response.json({
    product: {
      ...row,
      tags: tags.results.map((tag) => String((tag as { name: string }).name))
        .length
        ? tags.results.map((tag) => String((tag as { name: string }).name))
        : JSON.parse(String(row.tags || '[]')),
      legacyImages: JSON.parse(String(row.images || '[]')),
      variants: (variants.results as Record<string, unknown>[]).map(
        (variant) => ({
          ...variant,
          exact_image_ids: JSON.parse(String(variant.exact_image_ids || '[]')),
          enabled: Boolean(variant.active),
        }),
      ),
      images: images.results,
      relatedProductIds: related.results.map((item) =>
        String((item as { related_product_id: string }).related_product_id),
      ),
    },
  });
}
