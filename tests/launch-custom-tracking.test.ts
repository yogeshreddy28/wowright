import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import { createCustomerSession } from '@/lib/customer-auth';
import {
  priceCustomRequest,
  approveCustomRequest,
} from '@/lib/services/custom-orders';
import { fulfill, confirmUPI } from '@/lib/services/fulfillment';
import { flushMetaOutbox } from '@/lib/services/meta';
import { recordCommerceEvent } from '@/lib/services/tracking';
import { readOperationOrder } from '@/lib/services/order-mutation';
const bindings = vi.hoisted(() => ({
  DB: {} as D1Database,
  FILES: { put: vi.fn(), delete: vi.fn() },
}));
vi.mock('cloudflare:workers', () => ({ env: bindings, waitUntil: vi.fn() }));
import { POST as analytics } from '@/app/api/analytics/route';
import { POST as review, GET as reviews } from '@/app/api/reviews/route';
import { POST as logout } from '@/app/api/account/logout/route';
import { GET as accountGet } from '@/app/api/account/route';
let database: ReturnType<typeof testDatabase>, cookie: string;
const account = { id: 'customer', mobile: '919000000001' };
const address = {
  name: 'Isolated customer',
  mobile: '9000000001',
  line1: 'Isolated address',
  locality: 'Isolated area',
  city: 'Bengaluru',
  state: 'Karnataka',
  pinCode: '560001',
  latitude: 12.97,
  longitude: 77.59,
};
beforeEach(async () => {
  database = testDatabase();
  bindings.DB = database.db;
  database.sqlite.exec(
    "INSERT INTO customers(id,name,mobile) VALUES('customer','Isolated test','919000000001'); INSERT INTO custom_quote_requests(id,request_number,customer_id,name,mobile,description,quantity,status) VALUES('quote','TEST-QUOTE','customer','Isolated test','919000000001','Isolated specifications request',2,'submitted');",
  );
  cookie = (await createCustomerSession(bindings.DB, 'customer')).split(';')[0];
});
afterEach(() => {
  database.sqlite.close();
  vi.unstubAllEnvs();
});
async function approvedOrder() {
  await priceCustomRequest(bindings.DB, {
    requestId: 'quote',
    specifications: 'Owner-reviewed isolated specifications',
    price: 798,
    deliveryEstimate: '2099-01-01',
  });
  const result = await approveCustomRequest(
    bindings.DB,
    account,
    'quote',
    1,
    address,
  );
  return readOperationOrder(bindings.DB, result.orderNumber);
}
it('requires the latest approved custom quote and saves pending UPI once', async () => {
  await priceCustomRequest(bindings.DB, {
    requestId: 'quote',
    specifications: 'Owner-reviewed isolated specifications',
    price: 798,
    deliveryEstimate: '2099-01-01',
  });
  await expect(
    approveCustomRequest(bindings.DB, account, 'quote', 2, address),
  ).rejects.toThrow('quote changed');
  expect(
    database.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()?.n,
  ).toBe(0);
  const result = await approveCustomRequest(
    bindings.DB,
    account,
    'quote',
    1,
    address,
  );
  const again = await approveCustomRequest(
    bindings.DB,
    account,
    'quote',
    1,
    address,
  );
  expect(again.orderNumber).toBe(result.orderNumber);
  const order = await readOperationOrder(bindings.DB, result.orderNumber);
  expect(order.total).toBe(847);
  expect(order.payment_method).toBe('UPI');
  expect(order.payment_status).toBe('awaiting_payment');
  expect(new URL(result.url).searchParams.get('text')).toContain('847');
  const item = database.sqlite
    .prepare('SELECT id FROM order_items WHERE order_id=?')
    .get(order.id)!;
  await expect(
    fulfill(bindings.DB, order.id, { action: 'print', itemId: item.id }),
  ).rejects.toThrow('payment');
  await confirmUPI(bindings.DB, order.id);
  await expect(
    fulfill(bindings.DB, order.id, { action: 'print', itemId: item.id }),
  ).rejects.toThrow('print minutes');
  await fulfill(bindings.DB, order.id, {
    action: 'estimate',
    itemId: item.id,
    printMinutes: 60,
  });
  await fulfill(bindings.DB, order.id, { action: 'schedule' });
  await fulfill(bindings.DB, order.id, { action: 'print', itemId: item.id });
  expect((await readOperationOrder(bindings.DB, order.id)).status).toBe(
    'printing',
  );
});
it('custom request ownership and agreed prices cannot be changed after ordering', async () => {
  const order = await approvedOrder();
  await expect(
    approveCustomRequest(
      bindings.DB,
      { ...account, id: 'other' },
      'quote',
      1,
      address,
    ),
  ).rejects.toThrow('not found');
  await expect(
    priceCustomRequest(bindings.DB, {
      requestId: 'quote',
      specifications: 'Replacement specifications',
      price: 999,
      deliveryEstimate: '2099-01-01',
    }),
  ).rejects.toThrow('already converted');
  expect((await readOperationOrder(bindings.DB, order.id)).total).toBe(847);
});
it('Purchase is saved atomically and deduplicated, and respects Meta consent', async () => {
  const order = await approvedOrder();
  database.sqlite.exec(
    'UPDATE orders SET campaign_attribution=\'{"analyticsConsent":true}\'',
  );
  await confirmUPI(bindings.DB, order.id);
  await confirmUPI(bindings.DB, order.id);
  expect(
    database.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM commerce_outbox WHERE event_name='Purchase'",
      )
      .get()?.n,
  ).toBe(1);
  vi.stubEnv('META_PIXEL_ID', '123456789');
  vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'isolated-test-token');
  vi.stubEnv('META_API_VERSION', 'v25.0');
  const transport = vi.fn(async () => Response.json({ events_received: 1 }));
  expect((await flushMetaOutbox(bindings.DB, transport)).sent).toBe(1);
  expect((await flushMetaOutbox(bindings.DB, transport)).sent).toBe(0);
  expect(transport).toHaveBeenCalledTimes(1);
  await recordCommerceEvent(bindings.DB, { ...order, is_test: 1 }, 'Purchase');
  expect(
    database.sqlite
      .prepare(
        "SELECT COUNT(*) n FROM commerce_outbox WHERE event_name='Purchase'",
      )
      .get()?.n,
  ).toBe(1);
});
it('provider failures never leak token/error bodies into the outbox', async () => {
  const order = await approvedOrder();
  database.sqlite.exec(
    'UPDATE orders SET campaign_attribution=\'{"analyticsConsent":true}\'',
  );
  await confirmUPI(bindings.DB, order.id);
  vi.stubEnv('META_PIXEL_ID', '123456789');
  vi.stubEnv('META_CAPI_ACCESS_TOKEN', 'isolated-test-token');
  vi.stubEnv('META_API_VERSION', 'v25.0');
  const transport = vi.fn(
    async () => new Response('isolated-test-token', { status: 429 }),
  );
  await flushMetaOutbox(bindings.DB, transport);
  const row = database.sqlite.prepare('SELECT * FROM commerce_outbox').get()!;
  expect(row.last_error).toBe('rate_limited');
  expect(JSON.stringify(row)).not.toContain('isolated-test-token');
  expect(row.status).toBe('pending');
});
it('browser events cannot create purchases or persist arbitrary secret payloads', async () => {
  const request = (name: string) =>
    new Request('http://local/api/analytics', {
      method: 'POST',
      headers: { origin: 'http://local', 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        metadata: {
          apiKey: 'sk-isolated-test-only',
          utm_source: 'sk-isolated-test-only',
          quantity: 2,
        },
      }),
    });
  expect((await analytics(request('Purchase'))).status).toBe(403);
  expect((await analytics(request('AddToCart'))).status).toBe(200);
  const result = JSON.stringify(
    database.sqlite.prepare('SELECT * FROM analytics_events').all(),
  );
  expect(result).not.toContain('sk-isolated-test-only');
  expect(result).toContain('quantity');
});
it('only delivered purchases can be reviewed once; test purchases never appear publicly', async () => {
  const order = await approvedOrder();
  const item = database.sqlite
    .prepare('SELECT id,product_id FROM order_items WHERE order_id=?')
    .get(order.id)!;
  const req = () => {
    const form = new FormData();
    form.set('orderItemId', String(item.id));
    form.set('rating', '2');
    form.set('body', 'Isolated review fixture');
    return new Request('http://local/reviews', {
      method: 'POST',
      headers: { cookie, origin: 'http://local' },
      body: form,
    });
  };
  expect((await review(req())).status).toBe(403);
  database.sqlite
    .prepare("UPDATE orders SET status='delivered' WHERE id=?")
    .run(order.id);
  expect((await review(req())).status).toBe(200);
  expect((await review(req())).status).toBe(400);
  const publicRequest = new Request(
    'http://local/reviews?productId=' +
      encodeURIComponent(String(item.product_id)),
  );
  expect(
    ((await (await reviews(publicRequest)).json()) as any).reviews,
  ).toHaveLength(1);
  database.sqlite
    .prepare('UPDATE orders SET is_test=1 WHERE id=?')
    .run(order.id);
  expect(
    ((await (await reviews(publicRequest)).json()) as any).reviews,
  ).toHaveLength(0);
});
it('logging out revokes the server session, not just its browser cookie', async () => {
  expect(
    (
      await accountGet(
        new Request('http://local/account', { headers: { cookie } }),
      )
    ).status,
  ).toBe(200);
  await logout(
    new Request('http://local/logout', {
      method: 'POST',
      headers: { cookie, origin: 'http://local' },
    }),
  );
  expect(
    (
      await accountGet(
        new Request('http://local/account', { headers: { cookie } }),
      )
    ).status,
  ).toBe(401);
});
