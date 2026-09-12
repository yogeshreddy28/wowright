import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ProductCard } from '@/components/product-card';
import { CommerceEvent } from '@/components/commerce-event';
import { ShopFilters } from '@/components/shop-filters';
import {
  categorySlug,
  getCatalogCategories,
  getCatalogProducts,
} from '@/lib/catalog-repository';
import { getStartingPrice } from '@/lib/services/pricing';
import { toProductCardData } from '@/lib/product-card-data';
export const metadata: Metadata = {
  title: 'Shop personalized products',
  description:
    'Browse made-to-order personalized decor, gifts, name plates and custom products from WOW RIGHT.',
};
export default async function Shop({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const q = String(query.q || '')
    .trim()
    .toLowerCase();
  const category = String(query.category || '');
  const finish = String(query.finish || '');
  const sort = String(query.sort || 'newest');
  const min = Number(query.min || 0);
  const max = Number(query.max || Number.MAX_SAFE_INTEGER);
  const [all, categories] = await Promise.all([
    getCatalogProducts(),
    getCatalogCategories(),
  ]);
  const finishes = [
    ...new Set(
      all.flatMap((product) => [
        ...(product.variants || [])
          .filter((v) => v.active)
          .map((variant) => variant.name),
        ...product.options
          .filter((option) =>
            ['finish', 'colour', 'color'].includes(option.key.toLowerCase()),
          )
          .flatMap(
            (option) => option.values?.map((value) => value.value) || [],
          ),
      ]),
    ),
  ];
  const products = all
    .filter(
      (product) =>
        (!q ||
          `${product.name} ${product.shortDescription} ${(product.tags || []).join(' ')}`
            .toLowerCase()
            .includes(q)) &&
        (!category || categorySlug(product.category) === category) &&
        (!finish ||
          product.variants?.some(
            (variant) => variant.active && variant.name === finish,
          ) ||
          product.options.some((option) =>
            option.values?.some((value) => value.value === finish),
          )) &&
        getStartingPrice(product) >= min &&
        getStartingPrice(product) <= max,
    )
    .sort((a, b) =>
      sort === 'price-low'
        ? getStartingPrice(a) - getStartingPrice(b)
        : sort === 'price-high'
          ? getStartingPrice(b) - getStartingPrice(a)
          : 0,
    );
  return (
    <AppShell>
      {q && (
        <CommerceEvent
          name="Search"
          path="/shop"
          metadata={{ query: q, resultCount: products.length }}
        />
      )}
      <section className="page-head shop-head">
        <p className="eyebrow">The WOW RIGHT collection</p>
        <h1>
          Choose it.
          <br />
          <em>Make it yours.</em>
        </h1>
        <p>Find a piece you love. Choose a finish and make it yours.</p>
      </section>
      <section className="catalog-section">
        <ShopFilters
          categories={categories}
          finishes={finishes}
          values={{
            q: String(query.q || ''),
            category,
            finish,
            sort,
            min: String(query.min || ''),
            max: String(query.max || ''),
          }}
        />
        <div className="catalog-toolbar">
          <span>
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
          <span>Personalized · Made to order</span>
        </div>
        {products.length ? (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={toProductCardData(product)}
                density="shop"
                placement="shop"
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>No matching products</h2>
            <p>Try changing your search or filters.</p>
            <Link className="button secondary" href="/shop">
              Clear filters
            </Link>
          </div>
        )}
      </section>
    </AppShell>
  );
}
