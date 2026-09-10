import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  categorySkuPrefix,
  slugifyProduct,
} from '@/lib/services/product-admin';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { productId } = await params;
    const body = z
      .object({ copyImages: z.boolean().default(false) })
      .parse(await request.json().catch(() => ({})));
    const source = await env.DB.prepare(
      'SELECT p.*,c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?',
    )
      .bind(productId)
      .first<Record<string, unknown>>();
    if (!source)
      return Response.json({ error: 'Product not found.' }, { status: 404 });
    const base = `${slugifyProduct(String(source.name))}-copy`;
    let slug = base,
      suffix = 2;
    while (
      await env.DB.prepare('SELECT id FROM products WHERE slug=?')
        .bind(slug)
        .first()
    )
      slug = `${base}-${suffix++}`;
    const prefix = categorySkuPrefix(String(source.category_slug || 'product'));
    let next = await env.DB.prepare(
      'INSERT INTO sku_sequences (prefix,value) VALUES (?,1) ON CONFLICT(prefix) DO UPDATE SET value=value+1 RETURNING value',
    )
      .bind(prefix)
      .first<{ value: number }>();
    let sku = `WR-${prefix}-${String(next?.value || 1).padStart(3, '0')}`;
    while (
      await env.DB.prepare('SELECT id FROM products WHERE sku=?')
        .bind(sku)
        .first()
    ) {
      next = await env.DB.prepare(
        'UPDATE sku_sequences SET value=value+1 WHERE prefix=? RETURNING value',
      )
        .bind(prefix)
        .first<{ value: number }>();
      sku = `WR-${prefix}-${String(next!.value).padStart(3, '0')}`;
    }
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const columns = [
      'product_type',
      'internal_unit_cost',
      'name',
      'short_description',
      'description',
      'category',
      'category_id',
      'base_price',
      'compare_at_price',
      'stock_mode',
      'stock_quantity',
      'lead_time',
      'dimensions',
      'width',
      'depth',
      'height',
      'dimension_unit',
      'dimension_display_override',
      'material',
      'delivery_notes',
      'care_instructions',
      'commercial_license_status',
      'tags',
      'finish_reference_images',
      'availability',
      'estimated_print_minutes',
      'filament_grams',
      'support_difficulty',
      'print_profile_notes',
      'internal_production_notes',
      'seo_title',
      'seo_description',
    ];
    const marks = columns.map(() => '?').join(',');
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO products (id,slug,sku,${columns.join(',')},active,featured,status,publishing_status,images,created_at,updated_at) VALUES (?,?,?,${marks},1,0,'draft','draft',?,?,?)`,
      ).bind(
        id,
        slug,
        sku,
        ...columns.map((column) => source[column] ?? null),
        body.copyImages ? String(source.images || '[]') : '[]',
        now,
        now,
      ),
    ];
    const [
      variants,
      tags,
      related,
      images,
      options,
      optionValues,
      variantImages,
    ] = await env.DB.batch([
      env.DB.prepare(
        'SELECT * FROM product_variants WHERE product_id=? ORDER BY sort_order',
      ).bind(productId),
      env.DB.prepare('SELECT tag_id FROM product_tags WHERE product_id=?').bind(
        productId,
      ),
      env.DB.prepare(
        'SELECT related_product_id,sort_order FROM related_products WHERE product_id=?',
      ).bind(productId),
      env.DB.prepare(
        'SELECT * FROM product_images WHERE product_id=? ORDER BY sort_order',
      ).bind(productId),
      env.DB.prepare(
        'SELECT * FROM product_options WHERE product_id=? ORDER BY sort_order',
      ).bind(productId),
      env.DB.prepare(
        'SELECT v.* FROM product_option_values v JOIN product_options o ON o.id=v.option_id WHERE o.product_id=? ORDER BY v.sort_order',
      ).bind(productId),
      env.DB.prepare(
        'SELECT pvi.* FROM product_variant_images pvi JOIN product_variants v ON v.id=pvi.variant_id WHERE v.product_id=? ORDER BY pvi.sort_order',
      ).bind(productId),
    ]);
    const imageIds = new Map(
      (images.results as Record<string, unknown>[]).map((image) => [
        String(image.id),
        crypto.randomUUID(),
      ]),
    );
    const variantIds = new Map(
      (variants.results as Record<string, unknown>[]).map((variant) => [
        String(variant.id),
        crypto.randomUUID(),
      ]),
    );
    (variants.results as Record<string, unknown>[]).forEach((v, index) =>
      statements.push(
        env.DB.prepare(
          'INSERT INTO product_variants (id,product_id,name,sku,price_adjustment,finish_id,selling_price,original_price,exact_image_id,active,availability,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          variantIds.get(String(v.id)),
          id,
          v.name,
          `${sku}-${String(index + 1).padStart(2, '0')}`,
          v.price_adjustment,
          v.finish_id,
          v.selling_price,
          v.original_price,
          body.copyImages
            ? imageIds.get(String(v.exact_image_id)) || null
            : null,
          v.active,
          v.availability,
          v.sort_order,
          now,
          now,
        ),
      ),
    );
    (tags.results as Record<string, unknown>[]).forEach((t) =>
      statements.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO product_tags (product_id,tag_id) VALUES (?,?)',
        ).bind(id, t.tag_id),
      ),
    );
    (related.results as Record<string, unknown>[]).forEach((r) =>
      statements.push(
        env.DB.prepare(
          'INSERT OR IGNORE INTO related_products (product_id,related_product_id,sort_order) VALUES (?,?,?)',
        ).bind(id, r.related_product_id, r.sort_order),
      ),
    );
    if (body.copyImages)
      (images.results as Record<string, unknown>[]).forEach((image) =>
        statements.push(
          env.DB.prepare(
            'INSERT INTO product_images (id,product_id,storage_key,original_name,content_type,size,role,alt_text,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          ).bind(
            imageIds.get(String(image.id)),
            id,
            image.storage_key,
            image.original_name,
            image.content_type,
            image.size,
            image.role,
            image.alt_text,
            image.sort_order,
            now,
            now,
          ),
        ),
      );
    if (body.copyImages)
      (variantImages.results as Record<string, unknown>[]).forEach(
        (relation) => {
          const variantId = variantIds.get(String(relation.variant_id));
          const imageId = imageIds.get(String(relation.image_id));
          if (!variantId || !imageId) return;
          statements.push(
            env.DB.prepare(
              'INSERT INTO product_variant_images(id,variant_id,image_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)',
            ).bind(
              crypto.randomUUID(),
              variantId,
              imageId,
              relation.sort_order,
              now,
              now,
            ),
          );
        },
      );
    for (const option of options.results as Record<string, unknown>[]) {
      const optionId = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          'INSERT INTO product_options(id,product_id,name,key,type,required,sort_order,placeholder,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          optionId,
          id,
          option.name,
          option.key,
          option.type,
          option.required,
          option.sort_order,
          option.placeholder,
          now,
          now,
        ),
      );
      for (const value of optionValues.results as Record<string, unknown>[]) {
        if (value.option_id !== option.id) continue;
        statements.push(
          env.DB.prepare(
            'INSERT INTO product_option_values(id,option_id,label,value,price_adjustment,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
          ).bind(
            crypto.randomUUID(),
            optionId,
            value.label,
            value.value,
            value.price_adjustment,
            value.active,
            value.sort_order,
            now,
            now,
          ),
        );
      }
    }
    await env.DB.batch(statements);
    return Response.json({ id, slug, sku });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? 'Check the duplication options.'
            : 'Could not duplicate product. Refresh and try again.',
      },
      { status: 400 },
    );
  }
}
