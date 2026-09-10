'use client';

import Link from 'next/link';
import { Search } from 'lucide-react';
import type { CatalogCategory } from '@/lib/catalog-repository';
import { trackCommerce } from '@/lib/analytics-client';
import { shopCategoryHref } from '@/lib/catalog-links';

export function HomeDiscovery({
  categories,
}: {
  categories: CatalogCategory[];
}) {
  return (
    <div className="home-discovery" aria-label="Find products">
      <form action="/shop" className="home-search" role="search">
        <Search aria-hidden="true" />
        <input
          name="q"
          placeholder="Search WOW RIGHT"
          aria-label="Search WOW RIGHT"
        />
        <button type="submit">Search</button>
      </form>
      <nav className="category-shortcuts" aria-label="Shop by category">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={shopCategoryHref(category.slug)}
            onClick={() =>
              trackCommerce('category_shortcut_click', {
                category: category.slug,
                placement: 'homepage',
              })
            }
          >
            <span aria-hidden="true">{category.name.slice(0, 1)}</span>
            <b>{category.name}</b>
          </Link>
        ))}
        <Link
          href="/custom-print"
          onClick={() =>
            trackCommerce('category_shortcut_click', {
              category: 'custom',
              placement: 'homepage',
            })
          }
        >
          <span aria-hidden="true">+</span>
          <b>Custom</b>
        </Link>
      </nav>
    </div>
  );
}
