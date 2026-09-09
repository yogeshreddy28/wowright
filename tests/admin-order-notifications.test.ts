import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import { createAdminToken } from '@/lib/admin-auth';

const bindings = vi.hoisted(() => ({ DB: {} as D1Database }));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
import { GET, POST } from '@/app/api/admin/notifications/orders/route';

let database: ReturnType<typeof testDatabase>, cookie: string;
beforeEach(async () => {
  process.env.ADMIN_SESSION_SECRET = 'isolated-admin-session-secret-long-enough';
  database = testDatabase(); bindings.DB = database.db;
  cookie = `admin_session=${await createAdminToken('admin@test.invalid')}`;
  database.sqlite.exec("INSERT INTO customers(id,name,mobile) VALUES('customer','Customer','919000000002'); INSERT INTO customer_addresses(id,customer_id,line1,locality,city,state,pin_code) VALUES('address','customer','One','Area','Bengaluru','Karnataka','560001')");
});
afterEach(() => database.sqlite.close());
function post(body: unknown) { return POST(new Request('http://local/api/admin/notifications/orders', { method: 'POST', headers: { origin: 'http://local', cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); }

describe('Admin order acknowledgement', () => {
  it('requires Admin and keeps new orders unseen until deliberate acknowledgement', async () => {
    expect((await GET(new Request('http://local'))).status).toBe(401);
    await post({ action: 'initialize' });
    database.sqlite.exec("INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,subtotal,delivery_amount,total,is_test,created_at,updated_at) VALUES('new-order','WR-NEW','new-key','customer','address',500,49,549,0,'2099-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z'),('test-order','WR-TEST','test-key','customer','address',500,49,549,1,'2099-01-01T00:00:01.000Z','2099-01-01T00:00:01.000Z')");
    const first = await (await GET(new Request('http://local', { headers: { cookie } }))).json() as any;
    expect(first.unseen).toBe(1);
    expect((await (await GET(new Request('http://local', { headers: { cookie } }))).json() as any).unseen).toBe(1);
    await post({ action: 'acknowledge_order', orderId: 'WR-NEW' });
    expect((await (await GET(new Request('http://local', { headers: { cookie } }))).json() as any).unseen).toBe(0);
  });
});
