import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  categorySkuPrefix,
  LICENSE_STATUSES,
  parseCsv,
  slugifyProduct,
} from '@/lib/services/product-admin';

const requestSchema = z.object({
  mode: z.enum(['dry-run', 'commit']),
  format: z.enum(['csv', 'json']),
  content: z.string().min(1).max(2_000_000),
});
type ImportRow = Record<string, unknown>;

function value(row: ImportRow, ...keys: string[]) {
  for (const key of keys) if (row[key] !== undefined) return row[key];
}
function normalize(row: ImportRow, index: number) {
  const dimensions =
    typeof row.dimensions === 'object' && row.dimensions
      ? (row.dimensions as ImportRow)
      : {};
  let variants: unknown = [];
  try {
    variants =
      typeof row.variants === 'string'
        ? JSON.parse(row.variants || '[]')
        : row.variants || [];
  } catch {
    variants = 'invalid';
  }
  const number = (v: unknown) =>
    v === '' || v == null ? undefined : Number(v);
  return {
    row: index + 1,
    name: String(value(row, 'name') || '').trim(),
    category: String(value(row, 'category') || '').trim(),
    sku: String(value(row, 'sku') || '')
      .trim()
      .toUpperCase(),
    slug:
      String(value(row, 'slug') || '').trim() ||
      slugifyProduct(String(value(row, 'name') || '')),
    shortDescription: String(
      value(row, 'short_description', 'shortDescription') || '',
    ).trim(),
    description: String(value(row, 'description') || '').trim(),
    basePrice: number(value(row, 'selling_price', 'basePrice')) ?? 0,
    compareAtPrice: number(value(row, 'original_price', 'compareAtPrice')),
    width: number(value(row, 'width') ?? dimensions.width),
    depth: number(value(row, 'depth') ?? dimensions.depth),
    height: number(value(row, 'height') ?? dimensions.height),
    dimensionUnit: String(
      value(row, 'dimension_unit', 'dimensionUnit') || dimensions.unit || 'cm',
    ),
    material: String(value(row, 'material') || '').trim(),
    leadTime: String(value(row, 'lead_time', 'leadTime') || '').trim(),
    availability: String(value(row, 'availability') || 'available'),
    commercialLicenseStatus: String(
      value(row, 'commercial_license_status', 'commercialLicenseStatus') ||
        'unchecked',
    ),
    estimatedPrintMinutes: number(
      value(row, 'estimated_print_time', 'estimatedPrintMinutes'),
    ),
    filamentGrams: number(value(row, 'filament_grams', 'filamentGrams')),
    supportDifficulty: String(
      value(row, 'support_difficulty', 'supportDifficulty') || '',
    ).toLowerCase(),
    tags: Array.isArray(row.tags)
      ? row.tags
      : String(row.tags || '')
          .split('|')
          .map((v) => v.trim())
          .filter(Boolean),
    variants,
  };
}

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({
    csvHeaders: [
      'name',
      'category',
      'sku',
      'slug',
      'short_description',
      'description',
      'selling_price',
      'original_price',
      'width',
      'depth',
      'height',
      'dimension_unit',
      'material',
      'lead_time',
      'tags',
      'commercial_license_status',
      'estimated_print_time',
      'filament_grams',
      'support_difficulty',
      'variants',
    ],
    jsonShape: {
      name: '',
      category: '',
      sku: '',
      slug: '',
      short_description: '',
      description: '',
      selling_price: null,
      original_price: null,
      dimensions: { width: null, depth: null, height: null, unit: 'cm' },
      material: '',
      lead_time: '',
      tags: [],
      commercial_license_status: 'unchecked',
      estimated_print_time: null,
      filament_grams: null,
      support_difficulty: '',
      variants: [],
    },
    note: 'Imports are always created as Draft. No example product values are included.',
  });
}

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = requestSchema.parse(await request.json());
    const raw =
      input.format === 'json'
        ? JSON.parse(input.content)
        : parseCsv(input.content);
    const rows = (Array.isArray(raw) ? raw : [raw]).map((row, index) =>
      normalize(row as ImportRow, index),
    );
    if (!rows.length)
      return Response.json(
        { error: 'No product rows found.' },
        { status: 400 },
      );
    if (rows.length > 500)
      return Response.json(
        { error: 'Import up to 500 products at a time.' },
        { status: 400 },
      );
    const [categoryResult, existingResult, finishResult] = await env.DB.batch([
      env.DB.prepare('SELECT id,name,slug FROM categories WHERE active=1'),
      env.DB.prepare('SELECT slug,sku FROM products'),
      env.DB.prepare('SELECT id FROM global_finishes WHERE active=1'),
    ]);
    const categories = categoryResult.results as {
        id: string;
        name: string;
        slug: string;
      }[],
      existingSlugs = new Set(
        existingResult.results.map((r: any) => String(r.slug)),
      ),
      existingSkus = new Set(
        existingResult.results.map((r: any) => String(r.sku || '')),
      ),
      seenSlugs = new Set<string>(),
      seenSkus = new Set<string>();
    const finishIds = new Set(
      finishResult.results.map((finish: any) => String(finish.id)),
    );
    const prefixCounters = new Map<string, number>();
    for (const row of rows) {
      const category = categories.find(
        (c) =>
          c.name.toLowerCase() === row.category.toLowerCase() ||
          c.slug === slugifyProduct(row.category),
      );
      if (category && !row.sku) {
        const prefix = categorySkuPrefix(category.slug);
        if (!prefixCounters.has(prefix)) {
          const matches = [...existingSkus]
            .filter((s) => s.startsWith(`WR-${prefix}-`))
            .map((s) => Number(s.split('-').at(-1)))
            .filter(Number.isFinite);
          prefixCounters.set(prefix, Math.max(0, ...matches));
        }
        row.sku = `WR-${prefix}-${String((prefixCounters.get(prefix) || 0) + 1).padStart(3, '0')}`;
        prefixCounters.set(prefix, (prefixCounters.get(prefix) || 0) + 1);
      }
    }
    const preview = rows.map((row) => {
      const errors: string[] = [];
      const category = categories.find(
        (c) =>
          c.name.toLowerCase() === row.category.toLowerCase() ||
          c.slug === slugifyProduct(row.category),
      );
      if (!row.name) errors.push('Name is required.');
      if (!category) errors.push('Category must match an active category.');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug))
        errors.push('Slug is invalid.');
      if (existingSlugs.has(row.slug) || seenSlugs.has(row.slug))
        errors.push('Slug already exists or is duplicated in this import.');
      if (!row.sku) errors.push('SKU could not be generated.');
      if (existingSkus.has(row.sku) || seenSkus.has(row.sku))
        errors.push('SKU already exists or is duplicated in this import.');
      if (row.basePrice < 0 || !Number.isFinite(row.basePrice))
        errors.push('Selling price must be zero or greater.');
      if (
        row.compareAtPrice != null &&
        (!Number.isFinite(row.compareAtPrice) ||
          row.compareAtPrice < row.basePrice)
      )
        errors.push('Original price cannot be lower than selling price.');
      if (!LICENSE_STATUSES.includes(row.commercialLicenseStatus as any))
        errors.push('Commercial licence status is invalid.');
      if (
        !['available', 'temporarily_unavailable', 'discontinued'].includes(
          row.availability,
        )
      )
        errors.push('Availability is invalid.');
      if (row.variants === 'invalid' || !Array.isArray(row.variants))
        errors.push('Variants must be a valid JSON array.');
      else
        (row.variants as ImportRow[]).forEach((variant, index) => {
          const price = Number(variant.price ?? variant.selling_price);
          const original =
            variant.original_price == null
              ? undefined
              : Number(variant.original_price);
          if (!String(variant.name || '').trim())
            errors.push(`Variant ${index + 1} needs a name.`);
          if (!Number.isFinite(price) || price < 0)
            errors.push(`Variant ${index + 1} needs a valid selling price.`);
          if (
            original != null &&
            (!Number.isFinite(original) || original < price)
          )
            errors.push(
              `Variant ${index + 1} original price cannot be lower than its selling price.`,
            );
          if (variant.finish_id && !finishIds.has(String(variant.finish_id)))
            errors.push(`Variant ${index + 1} uses an unknown global finish.`);
        });
      if (!errors.length) {
        seenSlugs.add(row.slug);
        seenSkus.add(row.sku);
      }
      return {
        ...row,
        categoryId: category?.id,
        categoryName: category?.name,
        errors,
      };
    });
    const errorCount = preview.reduce((sum, row) => sum + row.errors.length, 0);
    if (input.mode === 'dry-run' || errorCount)
      return Response.json(
        { valid: errorCount === 0, errorCount, rows: preview },
        { status: errorCount && input.mode === 'commit' ? 422 : 200 },
      );
    const now = new Date().toISOString(),
      statements: D1PreparedStatement[] = [];
    for (const row of preview) {
      const id = crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          "INSERT INTO products (id,slug,sku,name,short_description,description,category,category_id,base_price,compare_at_price,active,featured,status,publishing_status,availability,stock_mode,lead_time,images,width,depth,height,dimension_unit,material,commercial_license_status,tags,finish_reference_images,estimated_print_minutes,filament_grams,support_difficulty,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,0,'draft','draft',?,'made_to_order',?,'[]',?,?,?,?,?,?,?,'{}',?,?,?, ?,?)",
        ).bind(
          id,
          row.slug,
          row.sku,
          row.name,
          row.shortDescription,
          row.description,
          row.categoryName,
          row.categoryId,
          row.basePrice,
          row.compareAtPrice ?? null,
          row.availability,
          row.leadTime,
          row.width ?? null,
          row.depth ?? null,
          row.height ?? null,
          row.dimensionUnit,
          row.material || null,
          row.commercialLicenseStatus,
          JSON.stringify(row.tags),
          row.estimatedPrintMinutes ?? null,
          row.filamentGrams ?? null,
          row.supportDifficulty || null,
          now,
          now,
        ),
      );
      (row.variants as ImportRow[]).forEach((variant, index) =>
        statements.push(
          env.DB.prepare(
            'INSERT INTO product_variants (id,product_id,name,sku,price_adjustment,finish_id,selling_price,original_price,active,availability,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
          ).bind(
            crypto.randomUUID(),
            id,
            String(variant.name || ''),
            String(
              variant.sku || `${row.sku}-${String(index + 1).padStart(2, '0')}`,
            ),
            0,
            variant.finish_id || null,
            variant.price ?? variant.selling_price ?? null,
            variant.original_price ?? null,
            Number(variant.enabled !== false),
            String(variant.availability || 'available'),
            index,
            now,
            now,
          ),
        ),
      );
      for (const tagName of row.tags
        .map((tag) => String(tag).trim())
        .filter(Boolean)) {
        const tagSlug = slugifyProduct(tagName),
          tagId = `tag_${tagSlug}`;
        statements.push(
          env.DB.prepare(
            'INSERT INTO tags (id,slug,name,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at',
          ).bind(tagId, tagSlug, tagName, now, now),
          env.DB.prepare(
            'INSERT OR IGNORE INTO product_tags (product_id,tag_id) VALUES (?,?)',
          ).bind(id, tagId),
        );
      }
    }
    await env.DB.batch(statements);
    return Response.json({
      ok: true,
      imported: preview.length,
      createdAs: 'draft',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Import could not be processed.',
      },
      { status: 400 },
    );
  }
}
