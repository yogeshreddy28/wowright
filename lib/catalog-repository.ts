import { env } from 'cloudflare:workers';
import type { Product, ProductOption, OptionValue } from './domain';
type Row = Record<string, unknown>;
export type CatalogCategory = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  image?: string;
  productCount: number;
};
function bool(value: unknown) {
  return Boolean(value);
}
function json<T>(value: unknown, fallback: T): T {
  try {
    return Array.isArray(value) || (typeof value === 'object' && value !== null)
      ? (value as T)
      : (JSON.parse(String(value || '')) as T);
  } catch {
    return fallback;
  }
}
export function categorySlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
async function hydrate(rows: Row[]): Promise<Product[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const marks = ids.map(() => '?').join(',');
  const [
    optionResult,
    valueResult,
    relatedResult,
    imageResult,
    variantResult,
    variantImageResult,
    tagResult,
    reviewResult,
    settingResult,
  ] = await env.DB.batch([
    env.DB.prepare(
      `SELECT * FROM product_options WHERE product_id IN (${marks}) ORDER BY sort_order`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT v.* FROM product_option_values v JOIN product_options o ON o.id=v.option_id WHERE o.product_id IN (${marks}) AND v.active=1 ORDER BY v.sort_order`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT * FROM related_products WHERE product_id IN (${marks}) ORDER BY sort_order`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT *,'/api/product-images/'||id url FROM product_images WHERE product_id IN (${marks}) ORDER BY CASE role WHEN 'main' THEN 0 ELSE 1 END,sort_order`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT v.*,f.name finish_name,f.swatch,(SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.global_finish_id=f.id ORDER BY i.sort_order LIMIT 1) reference_image,(SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.id=v.exact_image_id) exact_image FROM product_variants v LEFT JOIN global_finishes f ON f.id=v.finish_id WHERE v.product_id IN (${marks}) ORDER BY v.sort_order,v.created_at`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT v.product_id,pvi.variant_id,pvi.image_id,pvi.sort_order,'/api/product-images/'||pvi.image_id url FROM product_variant_images pvi JOIN product_variants v ON v.id=pvi.variant_id WHERE v.product_id IN (${marks}) ORDER BY pvi.sort_order,pvi.created_at`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT pt.product_id,t.name FROM product_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.product_id IN (${marks}) ORDER BY t.name`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT r.product_id,COUNT(*) review_count,AVG(r.rating) rating FROM reviews r JOIN order_items oi ON oi.id=r.order_item_id JOIN orders o ON o.id=oi.order_id WHERE r.product_id IN (${marks}) AND r.status='published' AND o.status='delivered' AND o.is_test=0 GROUP BY r.product_id`,
    ).bind(...ids),
    env.DB.prepare(
      "SELECT key,value FROM settings WHERE key IN ('productDefaultMaterial','productDefaultLeadTime','productDefaultDeliveryNotes','productDefaultCareInstructions','productMadeToOrderNotice')",
    ),
  ]);
  const defaults = Object.fromEntries(
    (settingResult.results as Row[]).map((setting) => {
      try {
        return [String(setting.key), JSON.parse(String(setting.value))];
      } catch {
        return [String(setting.key), ''];
      }
    }),
  );
  const values = (valueResult.results as Row[]).map((value) => ({
    id: String(value.id),
    optionId: String(value.option_id),
    label: String(value.label),
    value: String(value.value),
    priceAdjustment: Number(value.price_adjustment),
  }));
  return rows.map((row) => {
    const review = (reviewResult.results as Row[]).find(
      (item) => item.product_id === row.id,
    );
    const options = (optionResult.results as Row[])
      .filter((option) => option.product_id === row.id)
      .map((option) => ({
        id: String(option.id),
        key: String(option.key),
        name: String(option.name),
        type: String(option.type) as ProductOption['type'],
        required: bool(option.required),
        placeholder: option.placeholder
          ? String(option.placeholder)
          : undefined,
        values: values
          .filter((value) => value.optionId === option.id)
          .map(({ optionId: _, ...value }) => value as OptionValue),
      }));
    const normalizedImages = (imageResult.results as Row[])
      .filter((image) => image.product_id === row.id)
      .map((image) => String(image.url));
    const normalizedTags = (tagResult.results as Row[])
      .filter((tag) => tag.product_id === row.id)
      .map((tag) => String(tag.name));
    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      shortDescription: String(row.short_description),
      description: String(row.description),
      category: String(row.category),
      basePrice: Number(row.base_price),
      compareAtPrice:
        row.compare_at_price == null ? undefined : Number(row.compare_at_price),
      active: bool(row.active),
      featured: bool(row.featured),
      stockMode: String(row.stock_mode),
      productType:
        row.product_type === 'customizable' ||
        row.stock_mode === 'quote_only' ||
        Number(row.base_price) <= 0
          ? ('customizable' as const)
          : ('normal' as const),
      stockQuantity:
        row.stock_quantity == null ? undefined : Number(row.stock_quantity),
      leadTime: String(row.lead_time || defaults.productDefaultLeadTime || ''),
      images: normalizedImages.length
        ? normalizedImages
        : json<string[]>(row.images, []),
      options,
      status: (row.status ? String(row.status) : 'active') as Product['status'],
      dimensions: row.dimensions ? String(row.dimensions) : undefined,
      material: row.material
        ? String(row.material)
        : defaults.productDefaultMaterial
          ? String(defaults.productDefaultMaterial)
          : undefined,
      deliveryNotes: row.delivery_notes
        ? String(row.delivery_notes)
        : defaults.productDefaultDeliveryNotes
          ? String(defaults.productDefaultDeliveryNotes)
          : undefined,
      careInstructions: row.care_instructions
        ? String(row.care_instructions)
        : defaults.productDefaultCareInstructions
          ? String(defaults.productDefaultCareInstructions)
          : undefined,
      madeToOrderNotice: defaults.productMadeToOrderNotice
        ? String(defaults.productMadeToOrderNotice)
        : undefined,
      tags: normalizedTags.length
        ? normalizedTags
        : json<string[]>(row.tags, []),
      finishReferenceImages: json<Record<string, string>>(
        row.finish_reference_images,
        {},
      ),
      relatedProductIds: (relatedResult.results as Row[])
        .filter((related) => related.product_id === row.id)
        .map((related) => String(related.related_product_id)),
      publishingStatus: String(
        row.publishing_status ||
          (row.status === 'draft' ? 'draft' : 'published'),
      ) as Product['publishingStatus'],
      availability: String(
        row.availability ||
          (row.status === 'unavailable'
            ? 'temporarily_unavailable'
            : 'available'),
      ) as Product['availability'],
      structuredDimensions: {
        width: row.width == null ? undefined : Number(row.width),
        depth: row.depth == null ? undefined : Number(row.depth),
        height: row.height == null ? undefined : Number(row.height),
        unit: String(row.dimension_unit || 'cm'),
      },
      variants: (variantResult.results as Row[])
        .filter((variant) => variant.product_id === row.id)
        .map((variant) => {
          const linkedImages = (variantImageResult.results as Row[])
            .filter((image) => image.variant_id === variant.id)
            .map((image) => String(image.url));
          const legacyImage = variant.exact_image
            ? String(variant.exact_image)
            : undefined;
          const exactImages = [legacyImage, ...linkedImages].filter(
            (image, index, all): image is string =>
              Boolean(image) && all.indexOf(image) === index,
          );
          return {
            id: String(variant.id),
            name: String(variant.finish_name || variant.name),
            finishId: variant.finish_id ? String(variant.finish_id) : undefined,
            sellingPrice:
              variant.selling_price == null
                ? undefined
                : Number(variant.selling_price),
            originalPrice:
              variant.original_price == null
                ? undefined
                : Number(variant.original_price),
            priceAdjustment: Number(variant.price_adjustment || 0),
            active: bool(variant.active),
            availability: String(variant.availability || 'available') as
              | 'available'
              | 'temporarily_unavailable'
              | 'discontinued',
            exactImage: exactImages[0],
            exactImages,
            referenceImage: variant.reference_image
              ? String(variant.reference_image)
              : undefined,
            swatch: variant.swatch ? String(variant.swatch) : undefined,
          };
        }),
      rating: review ? Number(review.rating) : undefined,
      reviewCount: review ? Number(review.review_count) : 0,
    };
  });
}
export async function getCatalogProducts() {
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM products WHERE active=1 AND COALESCE(publishing_status,CASE WHEN status='draft' THEN 'draft' ELSE 'published' END)='published' AND COALESCE(availability,CASE WHEN status='unavailable' THEN 'temporarily_unavailable' ELSE 'available' END)<>'discontinued' ORDER BY featured DESC, created_at DESC",
    ).all();
    const items = await hydrate(result.results as Row[]);
    return items;
  } catch {
    // Never resurrect demo products when the database is empty or unavailable.
    return [];
  }
}
export async function getCatalogProductBySlug(slug: string) {
  return (await getCatalogProducts()).find((product) => product.slug === slug);
}
export async function getCatalogProductById(id: string) {
  return (await getCatalogProducts()).find((product) => product.id === id);
}
export async function getCatalogCategories(): Promise<CatalogCategory[]> {
  const products = await getCatalogProducts();
  try {
    const result = await env.DB.prepare(
      'SELECT id,slug,name,description,image FROM categories WHERE active=1 ORDER BY sort_order,name',
    ).all<Row>();
    const configured = result.results
      .map((row) => ({
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        description: row.description ? String(row.description) : undefined,
        image: row.image ? String(row.image) : undefined,
        productCount: products.filter(
          (product) => product.category === row.name,
        ).length,
      }))
      .filter((category) => category.productCount > 0);
    if (configured.length) return configured;
  } catch {}
  return [...new Set(products.map((product) => product.category))].map(
    (name) => ({
      id: categorySlug(name),
      slug: categorySlug(name),
      name,
      productCount: products.filter((product) => product.category === name)
        .length,
    }),
  );
}
export async function getRelatedProducts(product: Product) {
  const all = await getCatalogProducts();
  return (
    product.relatedProductIds?.length
      ? product.relatedProductIds
          .map((id) => all.find((item) => item.id === id))
          .filter(Boolean)
      : all
          .filter(
            (item) =>
              item.id !== product.id && item.category === product.category,
          )
          .slice(0, 4)
  ) as Product[];
}
export async function getBestSellingProducts() {
  try {
    const result = await env.DB.prepare(
      "SELECT p.* FROM products p JOIN (SELECT oi.product_id, SUM(oi.quantity) sold FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status='delivered' AND o.is_test=0 GROUP BY oi.product_id) sales ON sales.product_id=p.id WHERE p.active=1 AND p.publishing_status='published' AND p.availability='available' ORDER BY sales.sold DESC LIMIT 4",
    ).all();
    return hydrate(result.results as Row[]);
  } catch {
    return [];
  }
}
