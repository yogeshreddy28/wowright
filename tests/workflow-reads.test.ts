import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
const state = vi.hoisted(() => ({ DB: {} as D1Database, allowed: true }));
vi.mock('cloudflare:workers', () => ({ env: state }));
vi.mock('@/lib/admin-auth', () => ({ verifyAdmin: async () => state.allowed }));
import { GET as production } from '@/app/api/admin/production/route';
import { GET as delivery } from '@/app/api/admin/delivery/route';
import { GET as overview } from '@/app/api/admin/overview/route';
import { GET as reports } from '@/app/api/admin/reports/route';
import { GET as orders } from '@/app/api/admin/orders/route';
import { GET as conversations } from '@/app/api/admin/conversations/route';
let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
  state.allowed = true;
});
afterEach(() => database.sqlite.close());
describe('operational read models', () => {
  it('links attention filters to outstanding and overdue orders, excluding completed work', async () => {
    database.sqlite
      .exec(`INSERT INTO customers(id,name,mobile) VALUES('customer','Isolated customer','919000000001');
      INSERT INTO customer_addresses(id,customer_id,line1,locality,city,state,pin_code) VALUES('address','customer','Test address','Test area','Bengaluru','Karnataka','560001');
      INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,status,payment_status,subtotal,delivery_amount,total,promised_delivery_date) VALUES
      ('late','WR-TEST-LATE','late','customer','address','out_for_delivery','cod',599,49,648,'2000-01-01'),
      ('done','WR-TEST-DONE','done','customer','address','delivered','paid',599,49,648,'2000-01-01'),
      ('cancelled','WR-TEST-CANCELLED','cancelled','customer','address','cancelled','cod',599,49,648,'2000-01-01');`);
    const late = (await (
      await orders(new Request('http://local/api/admin/orders?status=at_risk'))
    ).json()) as any;
    const cod = (await (
      await orders(
        new Request('http://local/api/admin/orders?paymentStatus=cod'),
      )
    ).json()) as any;
    expect(late.orders.map((o: any) => o.id)).toEqual(['late']);
    expect(cod.orders.map((o: any) => o.id)).toEqual(['late']);
  });
  it('executes dashboard, production, delivery and reporting queries on the migrated schema', async () => {
    for (const handler of [
      overview,
      production,
      delivery,
      reports,
      orders,
      conversations,
    ]) {
      const response = await handler(
        new Request('http://local/api/admin?period=today'),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toBeTruthy();
    }
  });
  it('keeps every operational read behind Admin authentication', async () => {
    state.allowed = false;
    for (const handler of [
      overview,
      production,
      delivery,
      reports,
      orders,
      conversations,
    ])
      expect(
        (await handler(new Request('http://local/api/admin'))).status,
      ).toBe(401);
  });
  it('returns helpful empty states without fabricated workload or money', async () => {
    const p = (await (
      await production(new Request('http://local/api/admin/production'))
    ).json()) as any;
    const d = (await (
      await delivery(new Request('http://local/api/admin/delivery'))
    ).json()) as any;
    const o = (await (
      await overview(new Request('http://local/api/admin/overview'))
    ).json()) as any;
    expect(p.items).toEqual([]);
    expect(d.batches).toEqual([]);
    expect(d.ready).toEqual([]);
    expect(o.profitToday.estimatedProfit).toBe(0);
    expect(o.nextItem).toBeNull();
  });
});
