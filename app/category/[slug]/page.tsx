import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ProductCard } from '@/components/product-card';
import {
  getCatalogCategories,
  getCatalogProducts,
} from '@/lib/catalog-repository';
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [categories, all] = await Promise.all([
    getCatalogCategories(),
    getCatalogProducts(),
  ]);
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();
  const products = all.filter((product) => product.category === category.name);
  return (
    <AppShell>
      <section className="page-head compact">
        <Link href="/shop">← All products</Link>
        <p className="eyebrow">Shop by category</p>
        <h1>{category.name}</h1>
        {category.description && <p>{category.description}</p>}
      </section>
      <section className="catalog-section">
        <div className="catalog-toolbar">
          <span>
            {products.length} {products.length === 1 ? 'product' : 'products'}
          </span>
          <Link href="/shop">All products</Link>
        </div>
        {!products.length && (
          <div className="empty-state">
            <h2>This collection is taking shape</h2>
            <p>Explore our other products, or tell us what you’d like made.</p>
            <Link className="button primary" href="/shop">
              Explore products
            </Link>
            <Link className="button secondary" href="/custom-print">
              Request something custom
            </Link>
          </div>
        )}
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard
              product={product}
              key={product.id}
              density="shop"
              placement="category"
            />
          ))}
        </div>
      </section>
    </AppShell>
  );
}
