import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import { createCustomerSession } from '@/lib/customer-auth';
import { deliveryCookie } from '@/lib/delivery-auth';
import { launchTotals, assertBengaluru } from '@/lib/services/launch-rules';
import {
  allocateProduction,
  addDays,
  localDate,
} from '@/lib/services/production';
import { fulfill, confirmUPI } from '@/lib/services/fulfillment';
import { assignBatch, updateStop } from '@/lib/services/delivery-workflow';
import { generateDeliveryOtp, revealDeliveryOtp, verifyDeliveryOtp } from '@/lib/services/delivery-otp';
const bindings = vi.hoisted(() => ({
  DB: {} as D1Database,
  FILES: { put: vi.fn(), delete: vi.fn() },
}));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
import { POST as checkout } from '@/app/api/checkout/route';
import { POST as checkoutPreview } from '@/app/api/checkout/preview/route';
import { GET as orderGet } from '@/app/api/orders/[orderId]/route';
import { GET as deliveryGet } from '@/app/api/delivery/route';
import {
  POST as proofUpload,
  GET as proofGet,
} from '@/app/api/delivery/proof/route';
let database: ReturnType<typeof testDatabase>, cookie: string;
const session = '11111111-1111-4111-8111-111111111111';
const customer = {
  name: 'Isolated Test',
  mobile: '9000000001',
  line1: 'Test address',
  locality: 'Test area',
  city: 'Bengaluru',
  state: 'Karnataka',
  pinCode: '560001',
  latitude: 12.97,
  longitude: 77.59,
  labelType: 'Home',
};
async function requestCheckout(
  method = 'COD',
  overrides: Record<string, unknown> = {},
  key = crypto.randomUUID(),
) {
  return checkout(
    new Request('http://local/api/checkout', {
      method: 'POST',
      headers: {
        cookie,
        origin: 'http://local',
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({
        sessionId: session,
        paymentMethod: method,
        customer,
        items: [
          {
            productId: 'test-product',
            variantId: 'test-finish',
            quantity: 1,
            unitPrice: 599,
            selections: {},
          },
        ],
        ...overrides,
      }),
    }),
  );
}
async function requestPreview(
  items = [
    {
      productId: 'test-product',
      variantId: 'test-finish',
      quantity: 1,
      unitPrice: 599,
      selections: {},
    },
  ],
) {
  return checkoutPreview(
    new Request('http://local/api/checkout/preview', {
      method: 'POST',
      headers: {
        cookie,
        origin: 'http://local',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items }),
    }),
  );
}
async function readPreview(response: Response) {
  return (await response.json()) as {
    totals: ReturnType<typeof launchTotals>;
    estimatedDeliveryDate: string | null;
    requiresOwnerSchedule: boolean;
    checkedAt: string;
  };
}
beforeEach(async () => {
  database = testDatabase();
  bindings.DB = database.db;
  database.sqlite.exec(
    "INSERT INTO customers(id,name,mobile) VALUES('test-customer','Isolated test','919000000001'); INSERT INTO products(id,slug,name,short_description,description,category,category_id,base_price,publishing_status,status,commercial_license_status,estimated_print_minutes,internal_unit_cost) VALUES('test-product','isolated-product','Isolated product','','','Home Decor','cat_home_decor',599,'published','active','commercial_verified',120,100); INSERT INTO product_variants(id,product_id,name,sku,selling_price) VALUES('test-finish','test-product','Isolated finish','TEST-FINISH',599); INSERT INTO delivery_people(id,name,mobile,password_hash) VALUES('test-driver','Isolated Driver','919000000002','unused');",
  );
  cookie = (await createCustomerSession(database.db, 'test-customer')).split(
    ';',
  )[0];
});
afterEach(() => database.sqlite.close());
describe('launch commerce rules', () => {
  it('enforces ₹499 minimum and exact ₹49/free tiers', () => {
    expect(launchTotals(498).missing).toBe(1);
    expect(launchTotals(499).total).toBe(548);
    expect(launchTotals(998).deliveryAmount).toBe(49);
    expect(launchTotals(999).deliveryAmount).toBe(0);
  });
  it('blocks outside-Bengaluru and false coordinates', () => {
    expect(() => assertBengaluru(customer)).not.toThrow();
    expect(() => assertBengaluru({ ...customer, latitude: 19 })).toThrow();
    expect(() => assertBengaluru({ ...customer, city: 'Mumbai' })).toThrow();
  });
  it('rolls capacity forward without inventing missing durations', () => {
    const p = allocateProduction(
      [{ id: 'a', quantity: 2, estimated_print_minutes: 400 }],
      { '2026-09-06': 500 },
      '2026-09-06',
    );
    expect(p.allocations.map((a) => a.minutes)).toEqual([100, 600, 100]);
    expect(p.estimatedDeliveryDate).toBe('2026-09-09');
    expect(
      allocateProduction(
        [{ id: 'b', quantity: 1, estimated_print_minutes: null }],
        {},
      ).estimatedDeliveryDate,
    ).toBeNull();
  });
  it('requires authentication and rejects cross-origin checkout', async () => {
    expect(
      (
        await checkout(
          new Request('http://local/api/checkout', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await checkout(
          new Request('http://local/api/checkout', {
            method: 'POST',
            headers: { origin: 'https://evil.example' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(403);
  });
  it('creates COD on-site and deduplicates checkout safely', async () => {
    const key = crypto.randomUUID();
    const first = await requestCheckout('COD', {}, key),
      body = (await first.json()) as any;
    expect(first.status).toBe(200);
    expect(body.status).toBe('confirmed');
    expect(body.url).toBeUndefined();
    expect(
      ((await (await requestCheckout('COD', {}, key)).json()) as any).duplicate,
    ).toBe(true);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,
    ).toBe(1);
    const changed = await requestCheckout('UPI', {}, key);
    expect(changed.status).toBe(409);
  });
  it('previews server prices and capacity without creating orders or revealing internal fields', async () => {
    const response = await requestPreview();
    const body = await readPreview(response);
    expect(response.status).toBe(200);
    expect(body.totals.total).toBe(648);
    expect(body.estimatedDeliveryDate).toBe(addDays(localDate(), 1));
    expect(body.requiresOwnerSchedule).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(body).sort()).toEqual([
      'checkedAt',
      'estimatedDeliveryDate',
      'requiresOwnerSchedule',
      'totals',
    ]);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,
    ).toBe(0);
    expect(
      database.sqlite
        .prepare('SELECT COUNT(*) n FROM production_allocations')
        .get()!.n,
    ).toBe(0);
    expect(
      (
        await requestPreview([
          {
            productId: 'test-product',
            variantId: 'test-finish',
            quantity: 1,
            unitPrice: 1,
            selections: {},
          },
        ])
      ).status,
    ).toBe(409);
  });
  it('does not invent an estimate when item duration or existing backlog duration is unknown', async () => {
    database.sqlite.exec('UPDATE products SET estimated_print_minutes=NULL');
    expect(
      (await readPreview(await requestPreview())).estimatedDeliveryDate,
    ).toBeNull();
    expect((await requestCheckout()).status).toBe(200);
    database.sqlite.exec('UPDATE products SET estimated_print_minutes=120');
    const body = await readPreview(await requestPreview());
    expect(body.estimatedDeliveryDate).toBeNull();
    expect(body.requiresOwnerSchedule).toBe(true);
  });
  it('preview rolls into the next available production day and requires a same-origin signed-in customer', async () => {
    database.sqlite.exec('UPDATE products SET estimated_print_minutes=600');
    expect((await requestCheckout()).status).toBe(200);
    expect(
      (await readPreview(await requestPreview())).estimatedDeliveryDate,
    ).toBe(addDays(localDate(), 2));
    expect(
      (
        await checkoutPreview(
          new Request('http://local/api/checkout/preview', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await checkoutPreview(
          new Request('http://local/api/checkout/preview', {
            method: 'POST',
            headers: { cookie, origin: 'https://evil.example' },
            body: '{}',
          }),
        )
      ).status,
    ).toBe(403);
  });
  it('recalculates pricing and rejects tampered price, invalid finish, custom and unavailable products', async () => {
    expect(
      (
        await requestCheckout('COD', {
          items: [
            {
              productId: 'test-product',
              variantId: 'test-finish',
              quantity: 1,
              unitPrice: 1,
              selections: {},
            },
          ],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await requestCheckout('COD', {
          items: [
            {
              productId: 'test-product',
              variantId: 'wrong',
              quantity: 1,
              selections: {},
            },
          ],
        })
      ).status,
    ).toBe(409);
    database.sqlite.exec("UPDATE products SET product_type='customizable'");
    expect((await requestCheckout()).status).toBe(409);
    database.sqlite.exec(
      "UPDATE products SET product_type='normal',availability='temporarily_unavailable'",
    );
    expect((await requestCheckout()).status).toBe(409);
  });
  it('UPI persists pending before handoff and manual payment schedules work once', async () => {
    const r = await requestCheckout('UPI'),
      data = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(data.status).toBe('payment_pending');
    expect(decodeURIComponent(data.url)).toContain('₹648');
    expect(data.url).toContain('wa.me/919353193080');
    await confirmUPI(database.db, data.orderNumber);
    await confirmUPI(database.db, data.orderNumber);
    expect(
      database.sqlite
        .prepare('SELECT COUNT(*) n FROM payment_collections')
        .get()!.n,
    ).toBe(1);
    expect(
      database.sqlite
        .prepare(
          "SELECT COUNT(*) n FROM analytics_events WHERE name='Purchase'",
        )
        .get()!.n,
    ).toBe(1);
  });
  it('customer order access and delivery proof access are protected', async () => {
    const data = (await (await requestCheckout()).json()) as any,
      params = Promise.resolve({ orderId: data.orderNumber });
    expect(
      (await orderGet(new Request('http://local'), { params })).status,
    ).toBe(403);
    expect(
      (
        await orderGet(new Request('http://local', { headers: { cookie } }), {
          params,
        })
      ).status,
    ).toBe(200);
    expect((await deliveryGet(new Request('http://local'))).status).toBe(401);
    expect(
      (await proofGet(new Request('http://local/api/delivery/proof?id=x')))
        .status,
    ).toBe(401);
  });
  it('COD → printing → QC fail/reprint → packing → assigned delivery → private proof → collection → delivered', async () => {
    const data = (await (await requestCheckout()).json()) as any,
      order = database.sqlite
        .prepare('SELECT * FROM orders WHERE order_number=?')
        .get(data.orderNumber) as any,
      item = database.sqlite
        .prepare('SELECT * FROM order_items WHERE order_id=?')
        .get(order.id) as any;
    await expect(
      fulfill(database.db, order.id, { action: 'ready' }),
    ).rejects.toThrow();
    await fulfill(database.db, order.id, { action: 'print', itemId: item.id });
    await fulfill(database.db, order.id, {
      action: 'print_complete',
      itemId: item.id,
    });
    await expect(
      fulfill(database.db, order.id, {
        action: 'qc_pass',
        itemId: item.id,
        checklist: {},
      }),
    ).rejects.toThrow();
    await fulfill(database.db, order.id, {
      action: 'qc_fail',
      itemId: item.id,
      note: 'Test quality failure',
    });
    expect(
      database.sqlite
        .prepare('SELECT status FROM orders WHERE id=?')
        .get(order.id)!.status,
    ).toBe('reprint_required');
    await fulfill(database.db, order.id, { action: 'print', itemId: item.id });
    await fulfill(database.db, order.id, {
      action: 'print_complete',
      itemId: item.id,
    });
    await fulfill(database.db, order.id, {
      action: 'qc_pass',
      itemId: item.id,
      checklist: {
        correctProduct: true,
        correctFinish: true,
        correctQuantity: true,
        noDamage: true,
        acceptableAppearance: true,
      },
    });
    await expect(
      fulfill(database.db, order.id, { action: 'ready' }),
    ).rejects.toThrow();
    await fulfill(database.db, order.id, { action: 'pack', itemId: item.id });
    await fulfill(database.db, order.id, { action: 'ready' });
    const { localDate } = await import('@/lib/services/production');
    await assignBatch(database.db, {
      personId: 'test-driver',
      date: localDate(),
      timeWindow: 'Owner-approved test window',
      orderIds: [order.id],
    });
    const stop = database.sqlite
      .prepare('SELECT * FROM delivery_stops WHERE order_id=?')
      .get(order.id) as any;
    await expect(
      updateStop(database.db, 'unassigned-person', {
        stopId: stop.id,
        action: 'start',
      }),
    ).rejects.toThrow();
    await updateStop(database.db, 'test-driver', {
      stopId: stop.id,
      action: 'start',
    });
    await updateStop(database.db, 'test-driver', {
      stopId: stop.id,
      action: 'later',
      note: 'Return later today',
    });
    expect(
      database.sqlite
        .prepare('SELECT status FROM orders WHERE id=?')
        .get(order.id)!.status,
    ).toBe('out_for_delivery');
    const deliverySession = (
        await deliveryCookie(database.db, 'test-driver')
      ).split(';')[0],
      form = new FormData();
    form.set('stopId', stop.id);
    form.set('consent', 'true');
    form.set(
      'file',
      new File(
        [
          new Uint8Array([
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 0, 0, 0, 0,
          ]),
        ],
        'test.png',
        { type: 'image/png' },
      ),
    );
    const response = await proofUpload(
      new Request('http://local/api/delivery/proof', {
        method: 'POST',
        headers: { cookie: deliverySession },
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    const proof = (await response.json()) as any;
    await expect(
      updateStop(database.db, 'test-driver', {
        stopId: stop.id,
        action: 'prepare_otp',
        accepted: true,
        proofId: proof.id,
        method: 'cash',
        amount: 1,
      }),
    ).rejects.toThrow();
    await updateStop(database.db, 'test-driver', {
      stopId: stop.id,
      action: 'prepare_otp',
      accepted: true,
      proofId: proof.id,
      method: 'cash',
      amount: 648,
    });
    await generateDeliveryOtp(database.db, 'test-driver', stop.id, 'isolated-test-delivery-secret-long-enough');
    const revealed = await revealDeliveryOtp(database.db, order.id, 'test-customer', 'isolated-test-delivery-secret-long-enough');
    expect(revealed?.code).toMatch(/^\d{6}$/);
    await verifyDeliveryOtp(database.db, 'test-driver', stop.id, revealed!.code);
    await updateStop(database.db, 'test-driver', { stopId: stop.id, action: 'complete' });
    expect(
      database.sqlite
        .prepare('SELECT status,payment_status FROM orders WHERE id=?')
        .get(order.id),
    ).toEqual(
      expect.objectContaining({ status: 'delivered', payment_status: 'paid' }),
    );
    expect(
      database.sqlite
        .prepare(
          'SELECT amount_collected,settlement_status FROM payment_collections WHERE order_id=?',
        )
        .get(order.id),
    ).toEqual(
      expect.objectContaining({
        amount_collected: 648,
        settlement_status: 'pending',
      }),
    );
  });
});
