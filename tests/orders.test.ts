import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  businessDateKey,
  formatOrderNumber,
  getCheckoutOutcome,
} from '@/lib/services/orders';
import { normalizeIndianPhone } from '@/lib/services/phone';

describe('orders', () => {
  it('creates readable daily order numbers', () =>
    expect(formatOrderNumber('20260905', 14)).toBe('WR-20260905-0014'));
  it('uses the Bengaluru date at the UTC boundary', () =>
    expect(businessDateKey(new Date('2026-09-04T20:00:00Z'))).toBe('20260905'));
  it('allows valid production transitions', () =>
    expect(() => assertTransition('confirmed', 'printing')).not.toThrow());
  it('blocks impossible state transitions', () =>
    expect(() => assertTransition('delivered', 'confirmed')).toThrow());
  it('keeps COD on-site and sends only UPI to WhatsApp', () => {
    expect(getCheckoutOutcome('COD')).toEqual({
      orderStatus: 'confirmed',
      paymentStatus: 'cod',
      requiresWhatsApp: false,
    });
    expect(getCheckoutOutcome('UPI')).toEqual({
      orderStatus: 'payment_pending',
      paymentStatus: 'awaiting_payment',
      requiresWhatsApp: true,
    });
  });
  it('normalizes Indian mobile numbers', () => {
    expect(normalizeIndianPhone('93531 93080')).toBe('919353193080');
    expect(normalizeIndianPhone('+91 93531 93080')).toBe('919353193080');
  });
  it('rejects invalid Indian mobile numbers', () =>
    expect(() => normalizeIndianPhone('123')).toThrow());
});
