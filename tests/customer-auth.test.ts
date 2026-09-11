import { describe, expect, it } from 'vitest';
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from '@/lib/customer-auth';
import { createUPIPaymentURL } from '@/lib/services/whatsapp';
describe('customer authentication and UPI handoff', () => {
  it('stores a salted password derivation, never the password', async () => {
    const stored = await hashCustomerPassword('a-secure-customer-password');
    expect(stored).not.toContain('a-secure-customer-password');
    expect(
      await verifyCustomerPassword('a-secure-customer-password', stored),
    ).toBe(true);
    expect(await verifyCustomerPassword('wrong-password', stored)).toBe(false);
    expect(Number(stored.split('$')[1])).toBe(210_000);
  });
  it('includes the exact order number and server total in the UPI WhatsApp message', () => {
    const decoded = decodeURIComponent(
      createUPIPaymentURL({ orderNumber: 'WR-20260905-0014', total: 1399 }),
    );
    expect(decoded).toContain('WR-20260905-0014');
    expect(decoded).toContain('₹1,399');
  });
});
