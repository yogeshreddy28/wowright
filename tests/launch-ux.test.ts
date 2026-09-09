import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import { calculateCashHeld, getCashSummary, recordCashSettlement } from '@/lib/services/cash-reconciliation';
import { assertEditableProductJson } from '@/lib/services/product-admin';
import { shouldNotifyNewOrders, shouldRingOrderAlarm } from '@/components/admin-order-notifier';
import { createCustomerSession } from '@/lib/customer-auth';
import { mapViewport } from '@/components/address-location-picker';
import { deliveredOrderReviewPrompt, nextReviewPrompt } from '@/lib/services/review-eligibility';

const bindings = vi.hoisted(() => ({ DB: {} as D1Database }));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
import { POST as saveAddress, PATCH as updateAddress, GET as readAddresses } from '@/app/api/account/addresses/route';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); bindings.DB = database.db; });
afterEach(() => database.sqlite.close());

describe('launch UX security and accounting rules', () => {
  it('calculates physical cash held without mixing in UPI', async () => {
    database.sqlite.exec("INSERT INTO delivery_people(id,name,mobile,password_hash) VALUES('driver','Driver','919000000001','x'); INSERT INTO customers(id,name,mobile) VALUES('customer','Customer','919000000002'); INSERT INTO customer_addresses(id,customer_id,line1,locality,city,state,pin_code) VALUES('address','customer','One','Area','Bengaluru','Karnataka','560001'); INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,subtotal,delivery_amount,total,is_test) VALUES('order','WR-1','key','customer','address',500,49,549,0); INSERT INTO payment_collections(id,order_id,person_id,method,amount_due,amount_collected,collected_at) VALUES('cash','order','driver','cash',549,549,CURRENT_TIMESTAMP)");
    expect(calculateCashHeld(549, 200)).toEqual({ collected: 549, handedOver: 200, held: 349 });
    await recordCashSettlement(database.db, 'driver', 200, 'Receipt checked');
    expect(await getCashSummary(database.db, 'driver')).toEqual({ collected: 549, handedOver: 200, held: 349 });
    await expect(recordCashSettlement(database.db, 'driver', 350)).rejects.toThrow('cannot exceed');
  });

  it('does not notify on initial history or repeated polling', () => {
    expect(shouldNotifyNewOrders(0, 4, false)).toBe(false);
    expect(shouldNotifyNewOrders(4, 4, true)).toBe(false);
    expect(shouldNotifyNewOrders(4, 5, true)).toBe(true);
    expect(shouldRingOrderAlarm(2, true)).toBe(true);
    expect(shouldRingOrderAlarm(0, true)).toBe(false);
    expect(shouldRingOrderAlarm(2, false)).toBe(false);
    expect(shouldRingOrderAlarm(2, true, false)).toBe(false);
  });

  it('requires a saved-address type and a custom name', async () => {
    database.sqlite.exec("INSERT INTO customers(id,name,mobile) VALUES('label-customer','A','919000000021')");
    const cookie = (await createCustomerSession(database.db, 'label-customer')).split(';')[0];
    const request = (body: Record<string, unknown>) => saveAddress(new Request('http://local/api/account/addresses', { method: 'POST', headers: { origin: 'http://local', cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ line1: 'One Road', locality: 'Jayanagar', city: 'Bengaluru', state: 'Karnataka', pinCode: '560041', ...body }) }));
    expect((await request({})).status).toBe(400);
    expect((await request({ labelType: 'Custom' })).status).toBe(400);
    expect((await request({ labelType: 'Custom', customLabel: 'Grandma house' })).status).toBe(200);
  });

  it('uses a street-level map after location and respects review dismissal', () => {
    const view = mapViewport({ latitude: 12.9716, longitude: 77.5946 }, 18);
    expect(view.maxLon - view.minLon).toBeLessThan(0.01);
    const items = [{ item_id: 'one', product_name: 'Product', order_number: 'WR-1' }];
    expect(nextReviewPrompt(items, () => 0, 1_000_000_000)).toEqual(items[0]);
    expect(nextReviewPrompt(items, () => 1_000_000_000, 1_000_000_000)).toBeNull();
    expect(deliveredOrderReviewPrompt({ status: 'printing', previousStatus: 'confirmed', items, dismissedAt: () => 0 })).toBeNull();
    expect(deliveredOrderReviewPrompt({ status: 'delivered', previousStatus: 'out_for_delivery', items, dismissedAt: () => Date.now() })).toEqual(items[0]);
    expect(deliveredOrderReviewPrompt({ status: 'delivered', previousStatus: 'delivered', items: [], dismissedAt: () => 0 })).toBeNull();
  });

  it('blocks JSON-only fields and preserves publish validation', () => {
    expect(() => assertEditableProductJson({ id: 'overwrite' })).toThrow('read-only');
    expect(() => assertEditableProductJson({ name: 'Unsafe', categoryId: 'cat', basePrice: -1 })).toThrow();
    const parsed = assertEditableProductJson({ name: 'Draft', categoryId: 'cat', basePrice: 599, publishingStatus: 'draft' });
    expect(parsed.publishingStatus).toBe('draft');
  });

  it('stores named coordinates and prevents cross-customer address updates', async () => {
    database.sqlite.exec("INSERT INTO customers(id,name,mobile) VALUES('a','A','919000000011'),('b','B','919000000012')");
    const cookieA = (await createCustomerSession(database.db, 'a')).split(';')[0];
    const cookieB = (await createCustomerSession(database.db, 'b')).split(';')[0];
    const body = { labelType: 'Custom', customLabel: 'Parents', line1: 'One Road', locality: 'Jayanagar', city: 'Bengaluru', state: 'Karnataka', pinCode: '560041', latitude: 12.93, longitude: 77.58, isDefault: true };
    const saved = await saveAddress(new Request('http://local/api/account/addresses', { method: 'POST', headers: { origin: 'http://local', cookie: cookieA, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    expect(saved.status).toBe(200);
    const list = await (await readAddresses(new Request('http://local/api/account/addresses', { headers: { cookie: cookieA } }))).json() as any;
    expect(list.addresses[0]).toMatchObject({ label: 'Parents', latitude: 12.93, longitude: 77.58 });
    const denied = await updateAddress(new Request('http://local/api/account/addresses', { method: 'PATCH', headers: { origin: 'http://local', cookie: cookieB, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id: list.addresses[0].id }) }));
    expect(denied.status).toBe(404);
  });
});
