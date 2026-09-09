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

export type ProductAdminInput = z.infer<typeof productAdminInput>;

export function assertEditableProductJson(value: unknown) {
  const object = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const blocked = ['id', 'createdAt', 'updatedAt', 'images', 'sourceFolder'].filter((field) => field in object);
  if (blocked.length) throw new Error(`Remove read-only fields: ${blocked.join(', ')}.`);
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
      enabled: Boolean(v.active),
      availability: v.availability,
      sortOrder: v.sort_order,
    })),
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
