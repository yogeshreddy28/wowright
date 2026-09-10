import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shopCategoryHref, shopFilterHref } from '@/lib/catalog-links';
import { galleryForFinish, isFinishReferenceOnly } from '@/lib/product-gallery';
import type { ProductVariant } from '@/lib/domain';

const finish = (value: Partial<ProductVariant> = {}): ProductVariant => ({
  id: 'finish-black',
  name: 'Premium Black',
  priceAdjustment: 0,
  active: true,
  availability: 'available',
  ...value,
});

describe('mobile catalogue and universal finish behavior', () => {
  it('routes category shortcuts into URL-backed Shop filters', () => {
    expect(shopCategoryHref('home-decor')).toBe('/shop?category=home-decor');
    expect(
      shopFilterHref('/shop', 'category=home-decor', 'sort', 'price-low'),
    ).toBe('/shop?category=home-decor&sort=price-low');
    expect(shopFilterHref('/shop', 'category=home-decor', 'category', '')).toBe(
      '/shop',
    );
  });

  it('uses product-specific finish photos when configured', () => {
    expect(
      galleryForFinish(
        ['/default-one.webp', '/default-two.webp'],
        finish({ exactImages: ['/black-one.webp', '/black-two.webp'] }),
      ),
    ).toEqual(['/black-one.webp', '/black-two.webp']);
  });

  it('keeps the default gallery when a finish has no exact photo', () => {
    const selected = finish({ referenceImage: '/finish-reference.webp' });
    expect(galleryForFinish(['/default.webp'], selected)).toEqual([
      '/default.webp',
    ]);
    expect(isFinishReferenceOnly(selected)).toBe(true);
    expect(galleryForFinish(['/default.webp'], selected)).not.toContain(
      '/finish-reference.webp',
    );
  });

  it('keeps Hero, Featured catalogue and Custom in the approved order', () => {
    const source = readFileSync('app/page.tsx', 'utf8');
    expect(source.indexOf('className="hero"')).toBeLessThan(
      source.indexOf('featured-product-carousel'),
    );
    expect(source.indexOf('featured-product-carousel')).toBeLessThan(
      source.indexOf('className="custom-banner"'),
    );
  });

  it('defines a two-column mobile comparison grid and compact featured carousel', () => {
    const styles = readFileSync('app/globals.css', 'utf8');
    expect(styles).toContain('.featured-product-carousel');
    expect(styles).toMatch(
      /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    );
  });
});
