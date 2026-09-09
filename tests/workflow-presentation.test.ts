import { describe, expect, it } from 'vitest';
import {
  orderPresentation,
  paymentLabel,
  durationLabel,
  dateLabel,
  isOverdue,
  productReadiness,
} from '@/lib/workflow-presentation';

describe('truthful workflow presentation', () => {
  it('maps legacy production states to the same customer stage', () => {
    expect(orderPresentation('in_production')).toEqual(
      orderPresentation('printing'),
    );
    expect(orderPresentation('quality_check').next).toBe('Packing');
    expect(orderPresentation('packed').index).toBe(3);
  });
  it('never implies confirmation for placed, pending or unknown states', () => {
    for (const status of [
      'order_placed',
      'payment_pending',
      'awaiting_confirmation',
      'draft',
      'unknown',
      'cancelled',
    ])
      expect(orderPresentation(status).index).toBe(-1);
  });
  it('keeps delivery assignment separate from delivered', () => {
    expect(orderPresentation('scheduled').label).toBe('Delivery scheduled');
    expect(orderPresentation('scheduled').index).toBeLessThan(
      orderPresentation('delivered').index,
    );
    expect(orderPresentation('delivery_failed').tone).toBe('danger');
  });
  it('does not label unknown or unpaid payments as paid', () => {
    expect(paymentLabel('cod')).toBe('Pay on delivery');
    expect(paymentLabel('unpaid')).toBe('Not paid');
    expect(paymentLabel('unknown')).toBe('Payment under review');
  });
  it('shows practical print durations and no invented estimate', () => {
    expect(durationLabel(18)).toBe('18 min');
    expect(durationLabel(125)).toBe('2 hr 5 min');
    expect(durationLabel(null)).toBe('Print time needed');
    expect(durationLabel(0)).toBe('Print time needed');
  });
  it('handles absent dates and excludes completed orders from overdue warnings', () => {
    expect(dateLabel('invalid')).toBe('Date being reviewed');
    expect(dateLabel(null)).toBe('Date being reviewed');
    expect(isOverdue('2026-09-05', 'printing', '2026-09-07')).toBe(true);
    expect(isOverdue('2026-09-05', 'delivered', '2026-09-07')).toBe(false);
    expect(isOverdue('2026-09-05', 'cancelled', '2026-09-07')).toBe(false);
  });
  it('recognizes stored images and flags missing publication details', () => {
    const p = {
      main_image: '/api/product-images/image',
      base_price: 599,
      commercial_license_status: 'commercial_verified',
      short_description: 'Supplied description',
    };
    expect(productReadiness(p)).toEqual([]);
    expect(
      productReadiness({
        ...p,
        main_image: null,
        commercial_license_status: 'unchecked',
      }),
    ).toEqual(['Main image', 'Licence check']);
  });
  it('does not ask quote-only products to invent a selling price', () => {
    expect(
      productReadiness({ stock_mode: 'quote_only', base_price: 0 }),
    ).not.toContain('Selling price');
    expect(
      productReadiness({ product_type: 'customizable', base_price: 0 }),
    ).not.toContain('Selling price');
    expect(
      productReadiness({ product_type: 'normal', base_price: 0 }),
    ).toContain('Selling price');
  });
});
