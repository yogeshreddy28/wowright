import type { MetadataRoute } from 'next';
import {
  getCatalogCategories,
  getCatalogProducts,
} from '@/lib/catalog-repository';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL || 'http://localhost:3000';
  const [products, categories] = await Promise.all([
    getCatalogProducts(),
    getCatalogCategories(),
  ]);
  const routes = [
    '',
    '/shop',
    '/custom-print',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/policies',
  ];
  const now = new Date();
  return [
    ...routes.map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: path === '' ? ('weekly' as const) : ('monthly' as const),
      priority: path === '' ? 1 : 0.7,
    })),
    ...categories.map((category) => ({
      url: `${base}/category/${category.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    })),
    ...products
      .filter((product) => product.stockMode !== 'quote_only')
      .map((product) => ({
        url: `${base}/product/${product.slug}`,
        lastModified: now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
  ];
}
