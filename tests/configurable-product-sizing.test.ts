import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/domain';
import {
  calculateProductSize,
  calculateUnitPrice,
} from '@/lib/services/pricing';
import {
  productAdminInput,
  validateProductForPublish,
} from '@/lib/services/product-admin';

const configurableProduct = (): Product => ({
  id: 'resizable-fixture',
  slug: 'resizable-fixture',
  name: 'Resizable fixture',
  shortDescription: '',
  description: '',
  category: 'Home Decor',
  basePrice: 699,
  active: true,
  featured: false,
  stockMode: 'made_to_order',
  leadTime: 'Configured by owner',
  images: [],
  options: [],
  structuredDimensions: { width: 6, depth: 8, height: 10, unit: 'cm' },
  sizing: {
    enabled: true,
    minimumHeight: 8,
    maximumHeight: 20,
    defaultHeight: 10,
    increment: 1,
    pricingVersion: 3,
    priceBands: [
      {
        id: 'small',
        minimumHeight: 8,
        maximumHeight: 10,
        sellingPrice: 699,
        version: 3,
      },
      {
        id: 'medium',
        minimumHeight: 11,
        maximumHeight: 15,
        sellingPrice: 999,
        version: 3,
      },
      {
        id: 'large',
        minimumHeight: 16,
        maximumHeight: 20,
        sellingPrice: 1399,
        version: 3,
      },
    ],
    recommendations: [
      {
        id: 'desk',
        minimumHeight: 8,
        maximumHeight: 12,
        label: 'Great for a desk',
      },
      {
        id: 'display',
        minimumHeight: 13,
        maximumHeight: 20,
        label: 'Recommended for display spaces',
      },
    ],
  },
  variants: [
    {
      id: 'black',
      name: 'Black',
      priceAdjustment: 0,
      active: true,
      availability: 'available',
    },
    {
      id: 'copper',
      name: 'Copper Silky',
      priceAdjustment: 100,
      active: true,
      availability: 'available',
    },
    {
      id: 'white',
      name: 'White',
      priceAdjustment: 0,
      active: true,
      availability: 'temporarily_unavailable',
    },
  ],
});

describe('configurable product sizing', () => {
  it('uses the configured default and accepts the exact minimum and maximum', () => {
    const product = configurableProduct();
    expect(calculateProductSize(product)?.selectedHeight).toBe(10);
    expect(calculateProductSize(product, 8)?.selectedHeight).toBe(8);
    expect(calculateProductSize(product, 20)?.selectedHeight).toBe(20);
  });

  it('rejects out-of-range and off-increment heights', () => {
    const product = configurableProduct();
    expect(() => calculateProductSize(product, 7)).toThrow(
      'Choose an available size',
    );
    expect(() => calculateProductSize(product, 20.5)).toThrow(
      'Choose an available size',
    );
  });

  it('preserves model proportions and returns the matching recommendation', () => {
    expect(calculateProductSize(configurableProduct(), 15)).toMatchObject({
      selectedHeight: 15,
      width: 9,
      depth: 12,
      scale: 1.5,
      pricingBandId: 'medium',
      pricingVersion: 3,
      recommendation: { label: 'Recommended for display spaces' },
    });
  });

  it('uses a configured non-linear size price plus the trusted finish adjustment', () => {
    const product = configurableProduct();
    expect(calculateUnitPrice(product, {}, 'copper', 15).unitPrice).toBe(1099);
    expect(calculateUnitPrice(product, {}, 'copper', 20).unitPrice).toBe(1499);
    expect(() => calculateUnitPrice(product, {}, 'white', 15)).toThrow(
      'Invalid or unavailable finish',
    );
  });

  it('leaves non-resizable product pricing unchanged', () => {
    const product = configurableProduct();
    product.sizing = { ...product.sizing!, enabled: false };
    product.variants = [
      {
        id: 'fixed',
        name: 'Fixed finish',
        sellingPrice: 749,
        priceAdjustment: 0,
        active: true,
        availability: 'available',
      },
    ];
    expect(calculateProductSize(product, 18)).toBeUndefined();
    expect(calculateUnitPrice(product, {}, 'fixed', 18).unitPrice).toBe(749);
  });

  it('preserves the exact configured size through cart persistence', () => {
    const product = configurableProduct();
    const pricing = calculateUnitPrice(product, {}, 'copper', 15);
    const cartItem = {
      id: 'cart-line',
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantId: 'copper',
      variantName: 'Copper Silky',
      selections: {},
      selectedHeight: pricing.sizing!.selectedHeight,
      calculatedSize: pricing.sizing,
      unitPrice: pricing.unitPrice,
      quantity: 1,
    };

    expect(JSON.parse(JSON.stringify(cartItem))).toMatchObject({
      selectedHeight: 15,
      calculatedSize: {
        width: 9,
        depth: 12,
        scale: 1.5,
        pricingBandId: 'medium',
        pricingVersion: 3,
      },
      unitPrice: 1099,
    });
  });

  it('blocks publishing incomplete or overlapping size pricing rules', () => {
    const input = productAdminInput.parse({
      name: 'Configured fixture',
      categoryId: 'cat_home_decor',
      slug: 'configured-fixture',
      sku: 'WR-HOME-900',
      basePrice: 699,
      commercialLicenseStatus: 'commercial_verified',
      resizable: true,
      width: 6,
      depth: 8,
      height: 10,
      minimumHeight: 8,
      maximumHeight: 12,
      defaultHeight: 10,
      sizeIncrement: 1,
      sizePriceBands: [
        { minimumHeight: 8, maximumHeight: 10, sellingPrice: 699 },
        { minimumHeight: 10, maximumHeight: 12, sellingPrice: 899 },
      ],
    });
    expect(validateProductForPublish(input, 1)).toContain(
      'Size 10 cm must match exactly one price band.',
    );
  });
});
