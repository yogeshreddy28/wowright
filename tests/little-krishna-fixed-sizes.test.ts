import { describe, expect, it } from 'vitest';
import type { Product } from '@/lib/domain';
import { calculateUnitPrice, getStartingPrice } from '@/lib/services/pricing';

const black = 'finish-black-variant';
const copper = 'finish-copper-variant';
const product: Product = {
  id: 'little-krishna-test',
  slug: 'little-krishna',
  name: 'Little Krishna',
  category: 'Devotional',
  shortDescription: '',
  description: '',
  basePrice: 1699,
  active: true,
  featured: false,
  stockMode: 'made_to_order',
  leadTime: '',
  images: [],
  options: [],
  fixedSizes: [
    {
      id: 'medium',
      label: 'MEDIUM',
      heightCm: 16.6,
      active: true,
      prices: [
        { variantId: black, sellingPrice: 1699 },
        { variantId: copper, sellingPrice: 1799 },
      ],
    },
    {
      id: 'large',
      label: 'LARGE',
      heightCm: 19.6,
      active: true,
      prices: [
        { variantId: black, sellingPrice: 2299 },
        { variantId: copper, sellingPrice: 2399 },
      ],
    },
    {
      id: 'xl',
      label: 'XL',
      heightCm: 24.6,
      active: true,
      prices: [
        { variantId: black, sellingPrice: 3599 },
        { variantId: copper, sellingPrice: 3799 },
      ],
    },
  ],
  variants: [
    {
      id: black,
      name: 'Black',
      priceAdjustment: 0,
      active: true,
      availability: 'available',
    },
    {
      id: copper,
      name: 'Copper Silky',
      priceAdjustment: 0,
      active: true,
      availability: 'available',
    },
  ],
};

describe('Little Krishna fixed size and finish matrix', () => {
  it.each([
    ['medium', black, 1699],
    ['medium', copper, 1799],
    ['large', black, 2299],
    ['large', copper, 2399],
    ['xl', black, 3599],
    ['xl', copper, 3799],
  ])('%s and %s costs ₹%i', (size, finish, expected) => {
    const result = calculateUnitPrice(product, {}, finish, undefined, size);
    expect(result.unitPrice).toBe(expected);
    expect(result.fixedSize?.id).toBe(size);
  });
  it('starts at the real minimum price and never fabricates proportional dimensions', () => {
    expect(getStartingPrice(product)).toBe(1699);
    expect(
      calculateUnitPrice(product, {}, black, undefined, 'xl').sizing,
    ).toBeUndefined();
  });
  it('requires one of the three sizes and one of the available finishes', () => {
    expect(() => calculateUnitPrice(product, {}, black)).toThrow(
      'Choose an available fixed size',
    );
    expect(() =>
      calculateUnitPrice(product, {}, black, undefined, 'custom'),
    ).toThrow('Choose an available fixed size');
    expect(() => calculateUnitPrice(product, {}, black, 18, 'medium')).toThrow(
      'Custom dimensions cannot be entered',
    );
    expect(() =>
      calculateUnitPrice(product, {}, 'not-a-finish', undefined, 'medium'),
    ).toThrow('Invalid or unavailable finish');
  });
});
