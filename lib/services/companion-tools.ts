import { env } from 'cloudflare:workers';
import {
  getCatalogProductById,
  getCatalogProductBySlug,
  getCatalogProducts,
} from '@/lib/catalog-repository';
import { calculateUnitPrice } from './pricing';
import { getDeliveryAmount } from './delivery';
import type { Product, Selection } from '@/lib/domain';
import type { ProductRecommendation } from '@/lib/companion/types';

export {
  COMPANION_TOOL_NAMES,
  MUTATING_COMPANION_TOOLS,
  toolNeedsConfirmation,
} from '@/lib/companion/tools-policy';
export function recommendation(product: Product): ProductRecommendation {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    basePrice: product.basePrice,
    images: product.images,
    leadTime: product.leadTime,
  };
}
export async function searchProducts(query = '') {
  const all = await getCatalogProducts();
  const q = query.trim().toLowerCase();
  return all
    .filter(
      (p) =>
        p.active &&
        (!q ||
          `${p.name} ${p.category} ${p.shortDescription}`
            .toLowerCase()
            .includes(q)),
    )
    .map(recommendation);
}
export async function recommendProducts(intent = '') {
  const all = await searchProducts(intent);
  return (all.length ? all : await searchProducts()).slice(0, 3);
}
export async function getProductDetails(idOrSlug: string) {
  return (
    (await getCatalogProductById(idOrSlug)) ||
    (await getCatalogProductBySlug(idOrSlug))
  );
}
export async function getAvailableVariants(productId: string) {
  const rows = await env.DB.prepare(
    'SELECT id,name,sku,price_adjustment FROM product_variants WHERE product_id=? AND active=1 ORDER BY created_at',
  )
    .bind(productId)
    .all();
  return rows.results;
}
export async function calculateTrustedPrice(
  productId: string,
  selections: Selection,
  quantity = 1,
) {
  const product = await getCatalogProductById(productId);
  if (!product || !product.active || product.stockMode === 'quote_only')
    throw new Error('Product unavailable');
  const priced = calculateUnitPrice(product, selections);
  return {
    product: recommendation(product),
    selections,
    quantity,
    unitPrice: priced.unitPrice,
    lineTotal: priced.unitPrice * quantity,
    adjustments: priced.adjustments,
  };
}
export function estimateTrustedDelivery(subtotal: number) {
  return {
    deliveryAmount: getDeliveryAmount(subtotal),
    estimate:
      'Delivery timing is confirmed on WhatsApp after your order details are reviewed.',
  };
}
