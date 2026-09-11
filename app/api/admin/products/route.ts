import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  categorySkuPrefix,
  productAdminInput,
  slugifyProduct,
  validateProductForPublish,
  validateProductFinishRelations,
  productImageCount,
  type ProductAdminInput,
} from '@/lib/services/product-admin';

type Row = Record<string, unknown>;
type VariantRow = {
  id: string;
  product_id: string;
  finish_id: string | null;
  name: string;
  sku: string;
};
type VariantSkuOwner = VariantRow & { product_name: string };

async function uniqueSlug(
  db: D1Database,
  input: ProductAdminInput,
  excludeId = '',
) {
  const base = input.slug || slugifyProduct(input.name);
  if (!base) throw new Error('Enter a product name to generate a slug.');
  let candidate = base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const found = await db
      .prepare('SELECT id FROM products WHERE slug=? AND id<>?')
      .bind(candidate, excludeId)
      .first();
    if (!found) return candidate;
    if (input.slugManual)
      throw new Error('That slug is already used by another product.');
    candidate = `${base}-${suffix}`;
  }
  throw new Error('Could not generate a unique slug.');
}

async function uniqueSku(
  db: D1Database,
  input: ProductAdminInput,
  categorySlug: string,
  excludeId = '',
) {
  if (input.sku) {
    const value = input.sku.trim().toUpperCase();
    const found = await db
      .prepare('SELECT id FROM products WHERE sku=? AND id<>?')
      .bind(value, excludeId)
      .first();
    if (found) throw new Error('That SKU is already used by another product.');
    return value;
  }
  if (excludeId) {
    const current = await db
      .prepare('SELECT sku FROM products WHERE id=?')
      .bind(excludeId)
      .first<{ sku: string | null }>();
    if (current?.sku) return current.sku;
  }
  const prefix = categorySkuPrefix(categorySlug);
  for (let attempt = 0; attempt < 20; attempt++) {
    const next = await db
      .prepare(
        'INSERT INTO sku_sequences (prefix,value) VALUES (?,1) ON CONFLICT(prefix) DO UPDATE SET value=value+1 RETURNING value',
      )
      .bind(prefix)
      .first<{ value: number }>();
    if (!next) throw new Error('Could not generate a SKU.');
    const value = `WR-${prefix}-${String(next.value).padStart(3, '0')}`;
    if (
      !(await db
        .prepare('SELECT id FROM products WHERE sku=?')
        .bind(value)
        .first())
    )
      return value;
  }
  throw new Error('Could not allocate a unique SKU.');
}

async function getCategory(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT id,name,slug FROM categories WHERE id=? AND active=1')
    .bind(id)
    .first<{ id: string; name: string; slug: string }>();
  if (!row) throw new Error('Choose a valid active category.');
  return row;
}

async function saveRelations(
  db: D1Database,
  id: string,
  sku: string,
  input: ProductAdminInput,
  now: string,
) {
  const [existingResult, ownerResult] = await db.batch([
    db
      .prepare(
        'SELECT id,product_id,finish_id,name,sku FROM product_variants WHERE product_id=?',
      )
      .bind(id),
    db.prepare(
      'SELECT v.id,v.product_id,v.finish_id,v.name,v.sku,p.name product_name FROM product_variants v JOIN products p ON p.id=v.product_id',
    ),
  ]);
  const existing = existingResult.results as VariantRow[];
  const owners = ownerResult.results as VariantSkuOwner[];
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const existingByFinish = new Map(
    existing
      .filter((row) => row.finish_id)
      .map((row) => [row.finish_id as string, row]),
  );
  const ownerBySku = new Map(
    owners.map((row) => [row.sku.trim().toUpperCase(), row]),
  );
  const claimed = new Map<string, { id: string; name: string }>();
  const resolvedVariants = input.variants.map((variant, index) => {
    const matched = variant.id
      ? existingById.get(variant.id)
      : variant.finishId
        ? existingByFinish.get(variant.finishId)
        : undefined;
    const variantId = matched?.id || variant.id || crypto.randomUUID();
    const requestedSku = variant.sku?.trim().toUpperCase();
    let variantSku = matched?.sku.trim().toUpperCase() || requestedSku;
    if (!variantSku) {
      for (let suffix = index + 1; suffix < 1000; suffix++) {
        const candidate = `${sku}-${String(suffix).padStart(2, '0')}`;
        if (!ownerBySku.has(candidate) && !claimed.has(candidate)) {
          variantSku = candidate;
          break;
        }
      }
      if (!variantSku)
        throw new Error(`Could not generate a unique SKU for ${variant.name}.`);
    }
    const owner = ownerBySku.get(variantSku);
    if (owner && owner.id !== variantId)
      throw new Error(
        `SKU ${variantSku} is already used by ${owner.product_name} / ${owner.name}. Choose another SKU.`,
      );
    const inputOwner = claimed.get(variantSku);
    if (inputOwner && inputOwner.id !== variantId)
      throw new Error(
        `SKU ${variantSku} is already used by ${input.name} / ${inputOwner.name}. Choose another SKU.`,
      );
    claimed.set(variantSku, { id: variantId, name: variant.name });
    return { variant, variantId, variantSku, index };
  });
  const statements: D1PreparedStatement[] = [
    db
      .prepare('UPDATE product_variants SET active=0 WHERE product_id=?')
      .bind(id),
    db
      .prepare(
        'DELETE FROM product_variant_images WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id=?)',
      )
      .bind(id),
    db.prepare('DELETE FROM product_tags WHERE product_id=?').bind(id),
    db.prepare('DELETE FROM related_products WHERE product_id=?').bind(id),
  ];
  resolvedVariants.forEach(({ variant, variantId, variantSku, index }) => {
    statements.push(
      db
        .prepare(
          'INSERT INTO product_variants (id,product_id,name,sku,price_adjustment,finish_id,selling_price,original_price,exact_image_id,active,availability,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,price_adjustment=excluded.price_adjustment,finish_id=excluded.finish_id,selling_price=excluded.selling_price,original_price=excluded.original_price,exact_image_id=excluded.exact_image_id,active=excluded.active,availability=excluded.availability,sort_order=excluded.sort_order,updated_at=excluded.updated_at',
        )
        .bind(
          variantId,
          id,
          variant.name,
          variantSku,
          variant.priceAdjustment,
          variant.finishId || null,
          variant.sellingPrice ?? null,
          variant.originalPrice ?? null,
          variant.exactImageIds[0] || variant.exactImageId || null,
          Number(variant.enabled),
          variant.availability,
          index,
          now,
          now,
        ),
    );
    variant.exactImageIds.forEach((imageId, imageIndex) =>
      statements.push(
        db
          .prepare(
            'INSERT INTO product_variant_images(id,variant_id,image_id,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?)',
          )
          .bind(crypto.randomUUID(), variantId, imageId, imageIndex, now, now),
      ),
    );
  });
  [...new Set(input.tags)].forEach((name) => {
    const slug = slugifyProduct(name),
      tagId = `tag_${slug}`;
    statements.push(
      db
        .prepare(
          'INSERT INTO tags (id,slug,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at',
        )
        .bind(tagId, slug, name, now, now),
    );
    statements.push(
      db
        .prepare(
          'INSERT OR IGNORE INTO product_tags (product_id,tag_id) VALUES (?,?)',
        )
        .bind(id, tagId),
    );
  });
  input.relatedProductIds
    .filter((relatedId) => relatedId !== id)
    .forEach((relatedId, index) =>
      statements.push(
        db
          .prepare(
            'INSERT OR IGNORE INTO related_products (product_id,related_product_id,sort_order) VALUES (?,?,?)',
          )
          .bind(id, relatedId, index),
      ),
    );
  return statements;
}

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url),
    values: unknown[] = [],
    where: string[] = [];
  const search = url.searchParams.get('search')?.trim();
  if (search) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.slug LIKE ?)');
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  for (const [param, column] of [
    ['category', 'p.category_id'],
    ['publishing', 'p.publishing_status'],
    ['availability', 'p.availability'],
    ['licence', 'p.commercial_license_status'],
  ] as const) {
    const value = url.searchParams.get(param);
    if (value) {
      where.push(`${column}=?`);
      values.push(value);
    }
  }
  const result =
    await env.DB.prepare(`SELECT p.*,c.name category_name,c.slug category_slug,
    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id=p.id) variant_count,
    (SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) image_count,
    (SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.product_id=p.id AND i.role='main' ORDER BY i.sort_order LIMIT 1) main_image,
    COALESCE((SELECT MIN(COALESCE(v.selling_price,p.base_price+v.price_adjustment)) FROM product_variants v WHERE v.product_id=p.id AND v.active=1),p.base_price) starting_price
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.updated_at DESC LIMIT 200`)
      .bind(...values)
      .all<Row>();
  return Response.json({
    products: result.results.map((row) => ({
      ...row,
      images: JSON.parse(String(row.images || '[]')),
      tags: JSON.parse(String(row.tags || '[]')),
    })),
  });
}

export async function persist(
  db: D1Database,
  input: ProductAdminInput,
  id?: string,
  extraStatements: D1PreparedStatement[] = [],
) {
  const selectedCategory = await getCategory(db, input.categoryId);
  const slug = await uniqueSlug(db, input, id),
    sku = await uniqueSku(db, input, selectedCategory.slug, id);
  const now = new Date().toISOString(),
    productId = id || crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  let imageCount = input.images?.length || 0;
  await validateProductFinishRelations(db, input, productId);
  if (id) {
    imageCount = await productImageCount(db, id);
  }
  const product = {
    ...input,
    slug,
    sku,
    productType:
      input.productType ||
      (input.stockMode === 'quote_only' ||
      (!input.basePrice &&
        !input.variants.some((v) => v.enabled && (v.sellingPrice ?? 0) > 0))
        ? 'customizable'
        : 'normal'),
  };
  if (product.productType === 'customizable') product.stockMode = 'quote_only';
  if (product.publishingStatus === 'published') {
    const errors = validateProductForPublish(product, imageCount);
    if (errors.length)
      return {
        response: Response.json(
          { error: 'Product is not ready to publish.', errors },
          { status: 422 },
        ),
      };
  }
  const legacyStatus =
    product.publishingStatus === 'draft'
      ? 'draft'
      : product.availability === 'available'
        ? 'active'
        : 'unavailable';
  const values = [
    slug,
    sku,
    product.name,
    product.shortDescription,
    product.description,
    selectedCategory.name,
    selectedCategory.id,
    product.basePrice || 0,
    product.compareAtPrice ?? null,
    Number(product.featured),
    legacyStatus,
    product.publishingStatus,
    product.availability,
    product.stockMode,
    product.leadTime || '',
    product.dimensionDisplayOverride || null,
    product.width ?? null,
    product.depth ?? null,
    product.height ?? null,
    product.dimensionUnit,
    product.dimensionDisplayOverride || null,
    product.material || null,
    product.deliveryNotes || null,
    product.careInstructions || null,
    product.commercialLicenseStatus,
    JSON.stringify(product.tags),
    product.estimatedPrintMinutes ?? null,
    product.filamentGrams ?? null,
    product.supportDifficulty || null,
    product.printProfileNotes || null,
    product.internalProductionNotes || null,
    product.seoTitle || null,
    product.seoDescription || null,
    now,
  ];
  if (!id) {
    statements.push(
      db
        .prepare(
          "INSERT INTO products (id,slug,sku,name,short_description,description,category,category_id,base_price,compare_at_price,active,featured,status,publishing_status,availability,stock_mode,lead_time,images,tags,finish_reference_images,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,'[]','[]','{}',?,?)",
        )
        .bind(
          productId,
          slug,
          sku,
          product.name,
          product.shortDescription,
          product.description,
          selectedCategory.name,
          selectedCategory.id,
          product.basePrice || 0,
          product.compareAtPrice ?? null,
          Number(product.featured),
          'draft',
          'draft',
          product.availability,
          product.stockMode,
          product.leadTime || '',
          now,
          now,
        ),
    );
  }
  statements.push(
    db
      .prepare(
        'UPDATE products SET product_type=?,internal_unit_cost=?,source_folder=COALESCE(?,source_folder),images=COALESCE(?,images) WHERE id=?',
      )
      .bind(
        product.productType,
        product.internalUnitCost ?? null,
        product.sourceFolder || null,
        product.images ? JSON.stringify(product.images) : null,
        productId,
      ),
  );
  statements.push(
    db
      .prepare(
        'UPDATE products SET slug=?,sku=?,name=?,short_description=?,description=?,category=?,category_id=?,base_price=?,compare_at_price=?,featured=?,status=?,publishing_status=?,availability=?,stock_mode=?,lead_time=?,dimensions=?,width=?,depth=?,height=?,dimension_unit=?,dimension_display_override=?,material=?,delivery_notes=?,care_instructions=?,commercial_license_status=?,tags=?,estimated_print_minutes=?,filament_grams=?,support_difficulty=?,print_profile_notes=?,internal_production_notes=?,seo_title=?,seo_description=?,updated_at=? WHERE id=?',
      )
      .bind(...values, productId),
  );
  statements.push(...(await saveRelations(db, productId, sku, product, now)));
  statements.push(...extraStatements);
  await db.batch(statements);
  return { id: productId, slug, sku };
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await persist(
      env.DB,
      productAdminInput.parse(await request.json()),
    );
    if ('response' in result && result.response) return result.response;
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0]?.message
            : error instanceof Error
              ? error.message
              : 'Could not create product',
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = (await request.json()) as Record<string, unknown>;
    if (raw.action) {
      const command = z
        .object({
          id: z.string(),
          action: z.enum(['unpublish', 'unavailable', 'available']),
        })
        .parse(raw);
      const update =
        command.action === 'unpublish'
          ? "publishing_status='draft',status='draft'"
          : command.action === 'unavailable'
            ? "availability='temporarily_unavailable',status='unavailable'"
            : "availability='available',status=CASE WHEN publishing_status='published' THEN 'active' ELSE 'draft' END";
      await env.DB.prepare(
        `UPDATE products SET ${update},updated_at=? WHERE id=?`,
      )
        .bind(new Date().toISOString(), command.id)
        .run();
      return Response.json({ ok: true });
    }
    const input = productAdminInput.extend({ id: z.string() }).parse(raw);
    if (
      !(await env.DB.prepare('SELECT id FROM products WHERE id=?')
        .bind(input.id)
        .first())
    )
      return Response.json({ error: 'Product not found.' }, { status: 404 });
    const result = await persist(env.DB, input, input.id);
    if ('response' in result && result.response) return result.response;
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues[0]?.message
            : error instanceof Error
              ? error.message
              : 'Could not update product',
      },
      { status: 400 },
    );
  }
}
