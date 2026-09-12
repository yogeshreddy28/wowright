import { describe, expect, it } from 'vitest';
import { toProductCardData } from '@/lib/product-card-data';
import type { Product } from '@/lib/domain';
import { applySecurityHeaders } from '@/lib/security-headers';

describe('production conversion hardening', () => {
  it('adds HTTPS hardening and safe public caching', () => {
    const headers = applySecurityHeaders(new Headers(), '/product/example');
    expect(headers.get('strict-transport-security')).toContain(
      'max-age=31536000',
    );
    expect(headers.get('content-security-policy')).toContain(
      'block-all-mixed-content',
    );
    expect(headers.get('cache-control')).toContain('s-maxage=120');
    expect(
      applySecurityHeaders(new Headers(), '/_next/static/a.js').get(
        'cache-control',
      ),
    ).toContain('immutable');
  });

  it('keeps catalogue-card payloads compact without changing prices', () => {
    const product: Product = {
      id: 'p1',
      slug: 'example',
      name: 'Example',
      shortDescription: 'Short',
      description: 'A'.repeat(5000),
      category: 'Home Decor',
      basePrice: 499,
      active: true,
      featured: true,
      stockMode: 'made_to_order',
      leadTime: '',
      images: ['/one.webp', '/two.webp', '/three.webp'],
      options: [],
      variants: [
        {
          id: 'v1',
          name: 'Black',
          sellingPrice: 549,
          priceAdjustment: 0,
          active: true,
          availability: 'available',
          exactImages: ['/large-one.webp', '/large-two.webp'],
        },
      ],
    };
    const card = toProductCardData(product);
    expect(card.description).toBe('');
    expect(card.images).toEqual(['/one.webp']);
    expect(card.variants?.[0].sellingPrice).toBe(549);
    expect(card.variants?.[0].exactImages).toBeUndefined();
  });
});
