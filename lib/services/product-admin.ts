import { z } from 'zod';

export const LICENSE_STATUSES = [
  'unchecked',
  'commercial_verified',
  'personal_only',
  'restricted',
] as const;
export const AVAILABILITY_STATUSES = [
  'available',
  'temporarily_unavailable',
  'discontinued',
] as const;

export function slugifyProduct(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export function categorySkuPrefix(slug: string) {
  const known: Record<string, string> = {
    devotional: 'DEV',
    'personalized-gifts': 'GIFT',
    'home-decor': 'HOME',
    'desk-utility': 'DESK',
    'toys-fidgets': 'TOY',
    seasonal: 'SEA',
  };
  return (
    known[slug] ||
    slug
      .split('-')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 5) ||
    'PROD'
  );
}

const optionalNumber = z.preprocess(
  (value) => (value === '' || value == null ? undefined : Number(value)),
  z.number().nonnegative().optional(),
);
const optionalInteger = z.preprocess(
  (value) => (value === '' || value == null ? undefined : Number(value)),
  z.number().int().nonnegative().optional(),
);

export const productVariantInput = z.object({
  id: z.string().optional(),
  finishId: z.string().optional().nullable(),
  name: z.string().trim().min(1).max(100),
  sku: z.string().trim().max(100).optional(),
  sellingPrice: optionalInteger,
  originalPrice: optionalInteger,
  priceAdjustment: z.coerce.number().int().default(0),
  exactImageId: z.string().optional().nullable(),
  exactImageIds: z.array(z.string()).max(12).default([]),
  enabled: z.boolean().default(true),
  availability: z.enum(AVAILABILITY_STATUSES).default('available'),
  sortOrder: z.number().int().nonnegative().default(0),
});

export const productAdminInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(160),
  categoryId: z.string().min(1),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  slugManual: z.boolean().optional(),
  sku: z.string().trim().max(80).optional(),
  skuManual: z.boolean().optional(),
  shortDescription: z.string().trim().max(300).default(''),
  description: z.string().trim().max(10_000).default(''),
  basePrice: optionalInteger.default(0),
  productType: z.enum(['normal', 'customizable']).optional(),
  internalUnitCost: optionalInteger,
  sourceFolder: z.string().max(300).optional(),
  images: z
    .array(z.string().regex(/^\/(?!\/)[a-zA-Z0-9/_%. -]+$/))
    .max(12)
    .optional(),
  compareAtPrice: optionalInteger,
  stockMode: z
    .enum(['made_to_order', 'quote_only', 'tracked'])
    .default('made_to_order'),
  leadTime: z.string().trim().max(120).optional(),
  material: z.string().trim().max(200).optional(),
  width: optionalNumber,
  depth: optionalNumber,
  height: optionalNumber,
  dimensionUnit: z.enum(['mm', 'cm', 'in']).default('cm'),
  dimensionDisplayOverride: z.string().trim().max(300).optional(),
  deliveryNotes: z.string().trim().max(1000).optional(),
  careInstructions: z.string().trim().max(2000).optional(),
  commercialLicenseStatus: z.enum(LICENSE_STATUSES).default('unchecked'),
  estimatedPrintMinutes: optionalInteger,
  filamentGrams: optionalNumber,
  supportDifficulty: z.enum(['easy', 'medium', 'difficult']).optional(),
  printProfileNotes: z.string().trim().max(2000).optional(),
  internalProductionNotes: z.string().trim().max(5000).optional(),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional(),
  publishingStatus: z.enum(['draft', 'published']).default('draft'),
  availability: z.enum(AVAILABILITY_STATUSES).default('available'),
  featured: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(50)).max(30).default([]),
  relatedProductIds: z.array(z.string()).max(20).default([]),
  variants: z.array(productVariantInput).max(100).default([]),
});

const productJsonEditableSchema = productAdminInput.omit({
  id: true,
  slugManual: true,
  skuManual: true,
  sourceFolder: true,
  images: true,
});
const productJsonVariantPatchSchema = productVariantInput.partial();
const productJsonPatchSchema = productJsonEditableSchema
  .omit({ variants: true })
  .partial()
  .extend({
    variants: z.array(productJsonVariantPatchSchema).max(100).optional(),
  });

type ProductJsonImage = {
  id: string;
  role: string;
  altText: string;
  sortOrder: number;
};
export type ProductJsonState = {
  input: ProductAdminInput;
  images: {
    main: ProductJsonImage | null;
    gallery: ProductJsonImage[];
    legacyPaths: string[];
  };
};

export type ProductAdminInput = z.infer<typeof productAdminInput>;

const clearableStrings = new Set([
  'shortDescription',
  'description',
  'leadTime',
  'material',
  'dimensionDisplayOverride',
  'deliveryNotes',
  'careInstructions',
  'printProfileNotes',
  'internalProductionNotes',
  'seoTitle',
  'seoDescription',
]);
const enumAliases: Record<string, Record<string, string>> = {
  productType: { normal: 'normal', customizable: 'customizable' },
  stockMode: {
    made_to_order: 'made_to_order',
    madetoorder: 'made_to_order',
    quote_only: 'quote_only',
    quoteonly: 'quote_only',
    tracked: 'tracked',
  },
  dimensionUnit: { mm: 'mm', cm: 'cm', in: 'in', inch: 'in', inches: 'in' },
  commercialLicenseStatus: {
    unchecked: 'unchecked',
    commercial_verified: 'commercial_verified',
    commercialuseverified: 'commercial_verified',
    personal_only: 'personal_only',
    personaluseonly: 'personal_only',
    restricted: 'restricted',
    restrictedneedsreview: 'restricted',
  },
  supportDifficulty: {
    easy: 'easy',
    medium: 'medium',
    difficult: 'difficult',
  },
  publishingStatus: { draft: 'draft', published: 'published' },
  availability: {
    available: 'available',
    temporarily_unavailable: 'temporarily_unavailable',
    temporarilyunavailable: 'temporarily_unavailable',
    discontinued: 'discontinued',
  },
};

function enumToken(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
    : value;
}

function normalizeEnum(field: string, value: unknown) {
  if (value == null && field === 'supportDifficulty') return undefined;
  const token = enumToken(value);
  if (typeof token !== 'string') return value;
  const compact = token.replaceAll('_', '');
  return enumAliases[field]?.[token] ?? enumAliases[field]?.[compact] ?? token;
}

function canonicalVariant(variant: ProductAdminInput['variants'][number]) {
  return {
    id: variant.id || null,
    finishId: variant.finishId || null,
    name: variant.name,
    sku: variant.sku || '',
    sellingPrice: variant.sellingPrice ?? null,
    originalPrice: variant.originalPrice ?? null,
    priceAdjustment: variant.priceAdjustment,
    enabled: variant.enabled,
    availability: variant.availability,
    exactImageId: variant.exactImageId || null,
    exactImageIds: variant.exactImageIds,
    sortOrder: variant.sortOrder,
  };
}

/** The only field ordering used by both Product JSON export and import. */
export function canonicalProductJson(state: ProductJsonState) {
  const input = state.input;
  return {
    name: input.name,
    categoryId: input.categoryId,
    slug: input.slug || '',
    sku: input.sku || '',
    shortDescription: input.shortDescription,
    description: input.description,
    basePrice: input.basePrice,
    compareAtPrice: input.compareAtPrice ?? null,
    productType: input.productType || 'normal',
    stockMode: input.stockMode,
    leadTime: input.leadTime || '',
    material: input.material || '',
    width: input.width ?? null,
    depth: input.depth ?? null,
    height: input.height ?? null,
    dimensionUnit: input.dimensionUnit,
    dimensionDisplayOverride: input.dimensionDisplayOverride || '',
    deliveryNotes: input.deliveryNotes || '',
    careInstructions: input.careInstructions || '',
    commercialLicenseStatus: input.commercialLicenseStatus,
    estimatedPrintMinutes: input.estimatedPrintMinutes ?? null,
    filamentGrams: input.filamentGrams ?? null,
    supportDifficulty: input.supportDifficulty || null,
    printProfileNotes: input.printProfileNotes || '',
    internalProductionNotes: input.internalProductionNotes || '',
    internalUnitCost: input.internalUnitCost ?? null,
    seoTitle: input.seoTitle || '',
    seoDescription: input.seoDescription || '',
    publishingStatus: input.publishingStatus,
    availability: input.availability,
    featured: input.featured,
    tags: input.tags,
    relatedProductIds: input.relatedProductIds,
    variants: input.variants.map(canonicalVariant),
    images: state.images,
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return z.record(z.string(), z.unknown()).parse(value);
}

function productJsonWarnings(source: Record<string, unknown>) {
  const warnings: string[] = [];
  const known = new Set([
    ...Object.keys(productJsonPatchSchema.shape),
    'images',
  ]);
  for (const field of Object.keys(source))
    if (!known.has(field))
      warnings.push(
        `Unknown field "${field}" was ignored because it is not part of the Product schema.`,
      );
  const variantKnown = new Set(
    Object.keys(productJsonVariantPatchSchema.shape),
  );
  if (Array.isArray(source.variants))
    source.variants.forEach((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      for (const field of Object.keys(value))
        if (!variantKnown.has(field))
          warnings.push(
            `Unknown field "variants.${index}.${field}" was ignored because it is not part of the Product schema.`,
          );
    });
  return warnings;
}

function normalizePatchValues(source: Record<string, unknown>) {
  const normalized: Record<string, unknown> = { ...source };
  for (const field of clearableStrings)
    if (field in normalized && normalized[field] === null)
      normalized[field] = '';
  for (const field of Object.keys(enumAliases))
    if (field in normalized)
      normalized[field] = normalizeEnum(field, normalized[field]);
  if (Array.isArray(normalized.variants))
    normalized.variants = normalized.variants.map((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return value;
      const variant = { ...(value as Record<string, unknown>) };
      if ('availability' in variant)
        variant.availability = normalizeEnum(
          'availability',
          variant.availability,
        );
      return variant;
    });
  return normalized;
}

function normalizedName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function mergeVariantPatches(
  patches: z.infer<typeof productJsonVariantPatchSchema>[],
  existing: ProductAdminInput['variants'],
  warnings: string[],
) {
  if (!patches.length) {
    if (existing.length)
      warnings.push(
        'Variants cannot be removed in bulk through JSON and were preserved. Disable a finish explicitly or use the normal editor.',
      );
    return existing;
  }
  const merged = existing.map((variant) => ({ ...variant }));
  patches.forEach((patch, patchIndex) => {
    let index = patch.id
      ? merged.findIndex((variant) => variant.id === patch.id)
      : -1;
    if (index < 0 && patch.finishId)
      index = merged.findIndex(
        (variant) => variant.finishId === patch.finishId,
      );
    if (index < 0 && patch.name) {
      const matches = merged
        .map((variant, candidate) => ({ variant, candidate }))
        .filter(
          ({ variant }) =>
            normalizedName(variant.name) === normalizedName(patch.name),
        );
      if (matches.length === 1) index = matches[0].candidate;
    }
    if (
      index < 0 &&
      !patch.id &&
      !patch.finishId &&
      patches.length === existing.length &&
      merged[patchIndex]
    )
      index = patchIndex;
    if (index < 0 && !patch.id && !patch.finishId && existing.length === 1)
      index = 0;

    if (index >= 0) {
      const current = merged[index];
      const next = { ...current, ...patch };
      next.id = current.id;
      if (!patch.sku) {
        next.sku = current.sku;
        if ('sku' in patch)
          warnings.push(
            `Existing variant SKU for "${current.name}" cannot be cleared and was preserved.`,
          );
      }
      merged[index] = productVariantInput.parse(next);
      return;
    }
    merged.push(productVariantInput.parse(patch));
  });
  return merged;
}

/**
 * Merge a partial, possibly GPT-authored document with the authoritative saved
 * product. Missing keys preserve saved values; canonical output supplies all
 * schema defaults and stable relationship identities.
 */
export function normalizeProductJson(
  value: unknown,
  existing: ProductJsonState,
) {
  const source = objectValue(value);
  const blocked = [
    'id',
    'createdAt',
    'updatedAt',
    'sourceFolder',
    'slugManual',
    'skuManual',
  ].filter((field) => field in source);
  if (blocked.length)
    throw new Error(`Remove read-only fields: ${blocked.join(', ')}.`);
  const warnings = productJsonWarnings(source);
  if (
    'images' in source &&
    JSON.stringify(source.images) !== JSON.stringify(existing.images)
  )
    warnings.push(
      'Uploaded images are managed in the Images tab and were preserved.',
    );
  const normalized = normalizePatchValues(source);
  delete normalized.images;
  for (const key of Object.keys(normalized))
    if (!(key in productJsonPatchSchema.shape)) delete normalized[key];
  const parsedPatch = productJsonPatchSchema.parse(normalized);
  if (Array.isArray(normalized.variants) && parsedPatch.variants) {
    const rawVariants = normalized.variants as Record<string, unknown>[];
    parsedPatch.variants = parsedPatch.variants.map((variant, index) => {
      const raw = rawVariants[index];
      return Object.fromEntries(
        Object.keys(raw).map((key) => [
          key,
          variant[key as keyof typeof variant],
        ]),
      );
    });
  }
  const patch = Object.fromEntries(
    Object.keys(normalized).map((key) => [
      key,
      parsedPatch[key as keyof typeof parsedPatch],
    ]),
  ) as z.infer<typeof productJsonPatchSchema>;
  const variants =
    patch.variants === undefined
      ? existing.input.variants
      : mergeVariantPatches(patch.variants, existing.input.variants, warnings);
  const merged = { ...existing.input, ...patch, variants };
  if (!merged.slug) {
    merged.slug = existing.input.slug;
    warnings.push('The product slug cannot be cleared and was preserved.');
  }
  if (!merged.sku) {
    merged.sku = existing.input.sku;
    warnings.push('The product SKU cannot be cleared and was preserved.');
  }
  const input = productAdminInput.parse({
    ...merged,
    slugManual: true,
    skuManual: true,
  });
  const document = canonicalProductJson({ input, images: existing.images });
  const before = canonicalProductJson(existing);
  const changedFields = Object.keys(document).filter(
    (field) =>
      JSON.stringify(document[field as keyof typeof document]) !==
      JSON.stringify(before[field as keyof typeof before]),
  );
  return { input, document, warnings: [...new Set(warnings)], changedFields };
}

export function assertEditableProductJson(value: unknown) {
  const object =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const blocked = [
    'id',
    'createdAt',
    'updatedAt',
    'images',
    'sourceFolder',
  ].filter((field) => field in object);
  if (blocked.length)
    throw new Error(`Remove read-only fields: ${blocked.join(', ')}.`);
  return productAdminInput.parse(object);
}

export function validateProductForPublish(
  input: ProductAdminInput,
  imageCount: number,
) {
  const errors: string[] = [];
  if (!input.name) errors.push('Add a product name.');
  if (!input.categoryId) errors.push('Choose a category.');
  if (!input.slug) errors.push('A valid slug is required.');
  if (!input.sku) errors.push('A unique SKU is required.');
  if (
    input.stockMode !== 'quote_only' &&
    !input.basePrice &&
    !input.variants.some((v) => v.enabled && v.sellingPrice != null)
  )
    errors.push('Add a selling price or an enabled finish price.');
  if (!imageCount) errors.push('Upload a main image before publishing.');
  if (
    input.variants.length &&
    !input.variants.some((v) => v.enabled && v.availability === 'available')
  )
    errors.push('Enable at least one available finish.');
  if (input.commercialLicenseStatus !== 'commercial_verified')
    errors.push('Commercial use must be verified before publishing.');
  for (const variant of input.variants) {
    const price =
      variant.sellingPrice ?? input.basePrice + variant.priceAdjustment;
    if (variant.enabled && input.stockMode !== 'quote_only' && price <= 0)
      errors.push(`${variant.name}: enter a selling price greater than zero.`);
    if (
      variant.originalPrice != null &&
      variant.sellingPrice != null &&
      variant.originalPrice < variant.sellingPrice
    )
      errors.push(
        `${variant.name}: original price cannot be lower than selling price.`,
      );
  }
  if (
    input.compareAtPrice != null &&
    input.basePrice != null &&
    input.compareAtPrice < input.basePrice
  )
    errors.push('Original price cannot be lower than selling price.');
  return errors;
}

export async function validateProductFinishRelations(
  db: D1Database,
  input: ProductAdminInput,
  productId: string,
) {
  const seenFinishes = new Set<string>();
  for (const variant of input.variants) {
    if (variant.finishId) {
      if (seenFinishes.has(variant.finishId))
        throw new Error(
          'Each universal finish can only be added once to a product.',
        );
      seenFinishes.add(variant.finishId);
    }
    if (
      variant.id &&
      (await db
        .prepare('SELECT id FROM product_variants WHERE id=? AND product_id<>?')
        .bind(variant.id, productId)
        .first())
    )
      throw new Error('Invalid finish ownership.');
    if (
      variant.finishId &&
      !(await db
        .prepare('SELECT id FROM global_finishes WHERE id=? AND active=1')
        .bind(variant.finishId)
        .first())
    )
      throw new Error('Invalid global finish.');
    for (const imageId of [
      ...(variant.exactImageId ? [variant.exactImageId] : []),
      ...variant.exactImageIds,
    ]) {
      if (
        !(await db
          .prepare('SELECT id FROM product_images WHERE id=? AND product_id=?')
          .bind(imageId, productId)
          .first())
      )
        throw new Error('Invalid product-specific finish image.');
    }
  }
}

export async function productImageCount(db: D1Database, productId: string) {
  const count = await db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM product_images WHERE product_id=? AND role='main') normalized,(SELECT images FROM products WHERE id=?) legacy",
    )
    .bind(productId, productId)
    .first<{ normalized: number; legacy: string }>();
  return (
    Number(count?.normalized || 0) || JSON.parse(count?.legacy || '[]').length
  );
}

// Explicit mapping prevents private/new fields from being lost by older editors.
export function productInputFromRow(
  row: Record<string, unknown>,
  variants: Record<string, unknown>[],
  relatedProductIds: string[] = [],
) {
  const fields: Record<string, string> = {
    name: 'name',
    categoryId: 'category_id',
    slug: 'slug',
    sku: 'sku',
    shortDescription: 'short_description',
    description: 'description',
    basePrice: 'base_price',
    compareAtPrice: 'compare_at_price',
    stockMode: 'stock_mode',
    leadTime: 'lead_time',
    material: 'material',
    width: 'width',
    depth: 'depth',
    height: 'height',
    dimensionUnit: 'dimension_unit',
    dimensionDisplayOverride: 'dimension_display_override',
    deliveryNotes: 'delivery_notes',
    careInstructions: 'care_instructions',
    commercialLicenseStatus: 'commercial_license_status',
    estimatedPrintMinutes: 'estimated_print_minutes',
    filamentGrams: 'filament_grams',
    supportDifficulty: 'support_difficulty',
    printProfileNotes: 'print_profile_notes',
    internalProductionNotes: 'internal_production_notes',
    seoTitle: 'seo_title',
    seoDescription: 'seo_description',
    publishingStatus: 'publishing_status',
    availability: 'availability',
    productType: 'product_type',
    internalUnitCost: 'internal_unit_cost',
  };
  return {
    ...Object.fromEntries(
      Object.entries(fields).map(([key, column]) => [
        key,
        row[column] ?? undefined,
      ]),
    ),
    slugManual: true,
    skuManual: true,
    featured: Boolean(row.featured),
    tags: JSON.parse(String(row.tags || '[]')),
    relatedProductIds,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      finishId: v.finish_id,
      sellingPrice: v.selling_price ?? undefined,
      originalPrice: v.original_price ?? undefined,
      priceAdjustment: v.price_adjustment,
      exactImageId: v.exact_image_id,
      exactImageIds: Array.isArray(v.exact_image_ids)
        ? v.exact_image_ids
        : JSON.parse(String(v.exact_image_ids || '[]')),
      enabled: Boolean(v.active),
      availability: v.availability,
      sortOrder: v.sort_order,
    })),
  };
}

/** Load the database state used by both canonical JSON export and import. */
export async function loadProductJsonState(
  db: D1Database,
  productId: string,
): Promise<ProductJsonState | null> {
  const [product, variants, images, tags, related] = await db.batch([
    db.prepare('SELECT * FROM products WHERE id=?').bind(productId),
    db
      .prepare(
        'SELECT v.*,(SELECT json_group_array(pvi.image_id) FROM product_variant_images pvi WHERE pvi.variant_id=v.id ORDER BY pvi.sort_order) exact_image_ids FROM product_variants v WHERE v.product_id=? ORDER BY v.sort_order,v.created_at',
      )
      .bind(productId),
    db
      .prepare(
        "SELECT id,role,alt_text,sort_order FROM product_images WHERE product_id=? ORDER BY CASE role WHEN 'main' THEN 0 ELSE 1 END,sort_order,id",
      )
      .bind(productId),
    db
      .prepare(
        'SELECT t.name FROM tags t JOIN product_tags pt ON pt.tag_id=t.id WHERE pt.product_id=? ORDER BY t.name',
      )
      .bind(productId),
    db
      .prepare(
        'SELECT related_product_id FROM related_products WHERE product_id=? ORDER BY sort_order',
      )
      .bind(productId),
  ]);
  const row = product.results[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const relatedProductIds = related.results.map((item) =>
    String((item as { related_product_id: string }).related_product_id),
  );
  const relationalTags = tags.results.map((item) =>
    String((item as { name: string }).name),
  );
  const input = productAdminInput.parse(
    productInputFromRow(
      {
        ...row,
        tags: relationalTags.length ? JSON.stringify(relationalTags) : row.tags,
      },
      variants.results as Record<string, unknown>[],
      relatedProductIds,
    ),
  );
  const safeImages = (images.results as Record<string, unknown>[]).map(
    (image) => ({
      id: String(image.id),
      role: String(image.role),
      altText: String(image.alt_text || ''),
      sortOrder: Number(image.sort_order || 0),
    }),
  );
  return {
    input,
    images: {
      main: safeImages.find((image) => image.role === 'main') || null,
      gallery: safeImages.filter((image) => image.role !== 'main'),
      legacyPaths: JSON.parse(String(row.images || '[]')),
    },
  };
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '"' && text[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const headers = rows.shift()?.map((value) => value.trim()) || [];
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, i) => [header, values[i]?.trim() || '']),
    ),
  );
}
