'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Choice = { id: string; name: string; slug: string };

export function ShopFilters({
  categories,
  finishes,
  values,
}: {
  categories: Choice[];
  finishes: string[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function update(name: string, value: string, debounce = false) {
    const commit = () => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };
    if (timer.current) clearTimeout(timer.current);
    if (debounce) timer.current = setTimeout(commit, 300);
    else commit();
  }

  const active = Object.entries(values).some(
    ([key, value]) => value && !(key === 'sort' && value === 'newest'),
  );

  return (
    <form className="catalog-filters" onSubmit={(event) => event.preventDefault()}>
      <label>
        Search
        <input
          name="q"
          defaultValue={values.q}
          placeholder="Search products"
          onChange={(event) => update('q', event.target.value.trim(), true)}
        />
      </label>
      <label>
        Category
        <select
          name="category"
          value={values.category}
          onChange={(event) => update('category', event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((item) => (
            <option key={item.id} value={item.slug}>{item.name}</option>
          ))}
        </select>
      </label>
      <label>
        Sort
        <select
          name="sort"
          value={values.sort}
          onChange={(event) => update('sort', event.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </select>
      </label>
      <button
        type="button"
        className="button secondary catalog-reset"
        disabled={!active}
        onClick={() => router.push(pathname, { scroll: false })}
      >
        Reset filters
      </button>
      <details className="ux-shop-advanced" open={Boolean(values.finish || values.min || values.max)}>
        <summary>Finish & price filters</summary>
        <div>
          {finishes.length > 0 && (
            <label>
              Finish
              <select value={values.finish} onChange={(event) => update('finish', event.target.value)}>
                <option value="">All finishes</option>
                {finishes.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          )}
          <label>
            Minimum price
            <input type="number" min="0" defaultValue={values.min} onChange={(event) => update('min', event.target.value, true)} />
          </label>
          <label>
            Maximum price
            <input type="number" min="0" defaultValue={values.max} onChange={(event) => update('max', event.target.value, true)} />
          </label>
        </div>
      </details>
      <p className="catalog-filter-status" aria-live="polite">Filters update automatically.</p>
    </form>
  );
}
