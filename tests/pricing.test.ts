import { describe, expect, it } from 'vitest';
import { getProduct } from '@/lib/catalog';
import {
  assertPurchasableProduct,
  calculateCart,
  calculateUnitPrice,
} from '@/lib/services/pricing';
import { getDeliveryAmount } from '@/lib/services/delivery';
describe('trusted pricing', () => {
  it('rejects draft and unavailable products before checkout', () => {
    const product = getProduct('krishna-idol')!;
    expect(() =>
      assertPurchasableProduct({ ...product, status: 'draft' }),
    ).toThrow();
    expect(() =>
      assertPurchasableProduct({ ...product, active: false }),
    ).toThrow();
  });
  it('calculates option adjustments', () => {
    const p = getProduct('krishna-idol')!;
    expect(
      calculateUnitPrice(p, {
        size: 'medium',
        colour: 'green',
        lighting: 'yes',
      }).unitPrice,
    ).toBe(1299);
  });
  it('accepts required free-text customization without inventing a price', () => {
    const p = getProduct('custom-name-plate')!;
    expect(
      calculateUnitPrice(p, {
        text: 'YOGESH',
        size: '20cm',
        colour: 'white-oak',
        style: 'modern',
      }).unitPrice,
    ).toBe(899);
  });
  it('rejects missing required selections', () => {
    expect(() =>
      calculateUnitPrice(getProduct('custom-name-plate')!, {
        size: '20cm',
        colour: 'white-oak',
        style: 'modern',
      }),
    ).toThrow('Name / text is required');
  });
  it('rejects client-invented option values', () => {
    expect(() =>
      calculateUnitPrice(getProduct('krishna-idol')!, {
        size: 'free',
        colour: 'white',
        lighting: 'no',
      }),
    ).toThrow('Invalid Size');
  });
  it('calculates quantities and delivery', () => {
    expect(
      calculateCart([{ unitPrice: 699, quantity: 2 }], {
        baseCharge: 100,
        freeThreshold: 1999,
      }),
    ).toEqual({ subtotal: 1398, deliveryAmount: 100, total: 1498 });
  });
  it('supports free delivery and manual override', () => {
    expect(getDeliveryAmount(2500)).toBe(0);
    expect(getDeliveryAmount(2500, undefined, 75)).toBe(75);
  });
});
