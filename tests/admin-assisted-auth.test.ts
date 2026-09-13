import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
const bindings = vi.hoisted(() => ({ DB: {} as D1Database }));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
import { GET, POST } from '@/app/api/admin/orders/assisted/route';
import { GET as track } from '@/app/api/track/[token]/route';
import { createAdminToken } from '@/lib/admin-auth';
import { createAssistedOrder } from '@/lib/services/assisted-orders';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  bindings.DB = database.db;
  process.env.ADMIN_SESSION_SECRET = 'isolated-admin-session-secret-for-tests';
  process.env.SITE_URL = 'http://local';
  database.sqlite
    .exec(`INSERT INTO products(id,slug,name,short_description,description,category,base_price,active,featured,stock_mode,lead_time,status,publishing_status,availability,sku,estimated_print_minutes)
    VALUES('p','fixture','Safe Product','Short','Description','Home Decor',599,1,0,'made_to_order','Configured','active','published','available','WR-SAFE',20)`);
});
afterEach(() => database.sqlite.close());

function request(path: string, init: RequestInit = {}) {
  return new Request('http://local' + path, init);
}
function payload() {
  return {
    idempotencyKey: crypto.randomUUID(),
    customer: {
      mobile: '9000000988',
      name: 'Safe Customer',
      email: 'safe@example.test',
    },
    address: {
      label: 'Home',
      line1: '1 Safe Road',
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
      latitude: 12.97,
      longitude: 77.64,
    },
    items: [{ productId: 'p', quantity: 1, discount: 0 }],
    orderDiscount: 0,
    paymentMethod: 'COD',
    source: 'whatsapp',
    attribution: {},
  };
}

describe('assisted-order route protection and private tracking', () => {
  it('requires an authenticated Admin for reads and writes', async () => {
    expect((await GET(request('/api/admin/orders/assisted'))).status).toBe(401);
    expect(
      (
        await POST(
          request('/api/admin/orders/assisted', {
            method: 'POST',
            headers: {
              origin: 'http://local',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'preview', order: payload() }),
          }),
        )
      ).status,
    ).toBe(401);
    const cookie = `admin_session=${await createAdminToken('admin@example.test')}`;
    const response = await POST(
      request('/api/admin/orders/assisted', {
        method: 'POST',
        headers: {
          origin: 'http://local',
          cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'preview', order: payload() }),
      }),
    );
    expect(response.status).toBe(200);
  });

  it('public tracking is token-protected and excludes customer, address and internal fields', async () => {
    const created = await createAssistedOrder(database.db, payload());
    const missing = await track(request('/api/track/nope'), {
      params: Promise.resolve({ token: 'x'.repeat(43) }),
    });
    expect(missing.status).toBe(404);
    const response = await track(
      request('/api/track/' + created.trackingToken),
      { params: Promise.resolve({ token: created.trackingToken }) },
    );
    const text = JSON.stringify(await response.json());
    expect(response.status).toBe(200);
    expect(text).toContain('WR-');
    expect(text).not.toContain('9000000988');
    expect(text).not.toContain('Safe Road');
    expect(text).not.toContain('safe@example.test');
    expect(text).not.toContain('internal_notes');
  });
});
