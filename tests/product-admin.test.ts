import { describe, expect, it } from 'vitest';
import {
  categorySkuPrefix,
  parseCsv,
  productAdminInput,
  slugifyProduct,
  validateProductForPublish,
} from '@/lib/services/product-admin';
import { calculateUnitPrice } from '@/lib/services/pricing';
import type { Product } from '@/lib/domain';

const validProduct = productAdminInput.parse({
  name: 'Verified product',
  categoryId: 'category-1',
  slug: 'verified-product',
  sku: 'WR-HOME-001',
  basePrice: 599,
  commercialLicenseStatus: 'commercial_verified',
});

describe('product administration rules', () => {
  it('generates stable URL slugs and category SKU prefixes', () => {
    expect(slugifyProduct('  Edge Sitting Krishna ')).toBe(
      'edge-sitting-krishna',
    );
    expect(categorySkuPrefix('home-decor')).toBe('HOME');
    expect(categorySkuPrefix('desk-utility')).toBe('DESK');
  });

  it('blocks publishing without a main image or verified commercial use', () => {
    const errors = validateProductForPublish(
      { ...validProduct, commercialLicenseStatus: 'unchecked' },
      0,
    );
    expect(errors).toContain('Upload a main image before publishing.');
    expect(errors).toContain(
      'Commercial use must be verified before publishing.',
    );
  });

  it('accepts a fully validated publish candidate', () => {
    expect(validateProductForPublish(validProduct, 1)).toEqual([]);
  });

  it('parses quoted CSV without splitting embedded commas', () => {
    expect(
      parseCsv('name,category,description\n"Name plate","Home Decor","A, B"'),
    ).toEqual([
      { name: 'Name plate', category: 'Home Decor', description: 'A, B' },
    ]);
  });

  it('uses trusted exact finish pricing and rejects an unavailable finish', () => {
    const product: Product = {
      id: 'p1',
      slug: 'p1',
      name: 'Product',
      shortDescription: '',
      description: '',
      category: 'Home Decor',
      basePrice: 500,
      active: true,
      featured: false,
      stockMode: 'made_to_order',
      leadTime: '',
      images: [],
      options: [],
      variants: [
        {
          id: 'black',
          name: 'Black',
          sku: 'WR-HOME-001-01',
          sellingPrice: 649,
          priceAdjustment: 0,
          active: true,
          availability: 'available',
        },
        {
          id: 'copper',
          name: 'Copper',
          sku: 'WR-HOME-001-02',
          sellingPrice: 699,
          priceAdjustment: 0,
          active: true,
          availability: 'temporarily_unavailable',
        },
      ],
    };
    expect(calculateUnitPrice(product, {}, 'black').unitPrice).toBe(649);
    expect(() => calculateUnitPrice(product, {}, 'copper')).toThrow(
      'Invalid or unavailable finish',
    );
    expect(() => calculateUnitPrice(product, {})).toThrow('Choose a finish');
  });
});
