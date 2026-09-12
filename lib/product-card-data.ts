import type { Product } from './domain';

// Keep catalogue-card client payloads small. Product pages still receive the
// complete authoritative product model for pricing and customization.
export function toProductCardData(product: Product): Product {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: '',
    category: product.category,
    basePrice: product.basePrice,
    active: product.active,
    featured: product.featured,
    stockMode: product.stockMode,
    leadTime: product.leadTime,
    images: product.images.slice(0, 1),
    options: [],
    productType: product.productType,
    availability: product.availability,
    variants: (product.variants || []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      sellingPrice: variant.sellingPrice,
      priceAdjustment: variant.priceAdjustment,
      active: variant.active,
      availability: variant.availability,
    })),
    rating: product.rating,
    reviewCount: product.reviewCount,
  };
}
