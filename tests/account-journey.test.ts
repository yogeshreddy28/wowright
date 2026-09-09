import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
const state = vi.hoisted(() => ({ DB: {} as D1Database }));
vi.mock('cloudflare:workers', () => ({ env: state }));
import { POST as register } from '@/app/api/account/register/route';
import { POST as login } from '@/app/api/account/login/route';
import { GET as account } from '@/app/api/account/route';
import { GET as history } from '@/app/api/account/orders/route';
import {
  POST as saveAddress,
  GET as addresses,
  DELETE as removeAddress,
} from '@/app/api/account/addresses/route';
let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
});
afterEach(() => database.sqlite.close());
function request(
  path: string,
  body?: unknown,
  cookie = '',
  method = body ? 'POST' : 'GET',
) {
  const options: RequestInit = {
    method,
    headers: {
      origin: 'http://local',
      'Content-Type': 'application/json',
      cookie,
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  return new Request('http://local' + path, options);
}
async function customer(phone = '9000000011') {
  const password = crypto.randomUUID();
  const response = await register(
    request('/api/account/register', {
      name: 'Isolated QA account',
      phone,
      password,
    }),
  );
  expect(response.status).toBe(200);
  return {
    phone,
    password,
    cookie: response.headers.get('set-cookie')!.split(';')[0],
  };
}
describe('isolated account and saved-address journey', () => {
  it('registers, signs in and returns a safe customer view', async () => {
    const c = await customer();
    const response = await login(
      request('/api/account/login', { phone: c.phone, password: c.password }),
    );
    expect(response.status).toBe(200);
    const profile = await account(
      request(
        '/api/account',
        undefined,
        response.headers.get('set-cookie')!.split(';')[0],
      ),
    );
    const body = JSON.stringify(await profile.json());
    expect(profile.status).toBe(200);
    expect(body).not.toContain(c.password);
    expect(body).not.toContain('password_hash');
    expect(
      (await history(request('/api/account/orders', undefined, c.cookie)))
        .status,
    ).toBe(200);
  });
  it('preserves account uniqueness and rejects invalid login', async () => {
    const c = await customer();
    expect(
      (
        await register(
          request('/api/account/register', {
            name: 'Duplicate QA',
            phone: c.phone,
            password: crypto.randomUUID(),
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await login(
          request('/api/account/login', {
            phone: c.phone,
            password: crypto.randomUUID(),
          }),
        )
      ).status,
    ).toBe(401);
  });
  it('saves and reloads addresses without exposing them to another customer', async () => {
    const c = await customer(),
      other = await customer('9000000012');
    const saved = await saveAddress(
      request(
        '/api/account/addresses',
        {
          labelType: 'Custom',
          customLabel: 'QA only',
          line1: 'Isolated test address',
          locality: 'QA area',
          city: 'Bengaluru',
          state: 'Karnataka',
          pinCode: '560001',
          isDefault: true,
        },
        c.cookie,
      ),
    );
    expect(saved.status).toBe(200);
    const own = (await (
      await addresses(request('/api/account/addresses', undefined, c.cookie))
    ).json()) as any;
    const foreign = (await (
      await addresses(
        request('/api/account/addresses', undefined, other.cookie),
      )
    ).json()) as any;
    expect(own.addresses).toHaveLength(1);
    expect(own.addresses[0].is_default).toBe(1);
    expect(foreign.addresses).toEqual([]);
    await removeAddress(
      request(
        '/api/account/addresses?id=' + own.addresses[0].id,
        undefined,
        other.cookie,
        'DELETE',
      ),
    );
    expect(
      (
        (await (
          await addresses(
            request('/api/account/addresses', undefined, c.cookie),
          )
        ).json()) as any
      ).addresses,
    ).toHaveLength(1);
  });
  it('offers reviews only for delivered unreviewed purchases', async () => {
    const c = await customer('9000000015');
    const customerId = database.sqlite.prepare('SELECT id FROM customers WHERE mobile=?').get('919000000015')!.id;
    database.sqlite.prepare("INSERT INTO customer_addresses(id,customer_id,label,line1,locality,city,state,pin_code) VALUES('review-address',?,'Home','One','Area','Bengaluru','Karnataka','560001')").run(customerId);
    database.sqlite.prepare("INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,status,payment_status,subtotal,delivery_amount,total,is_test) VALUES('review-order','WR-REVIEW','review-key',?,'review-address','delivered','paid',500,49,549,0)").run(customerId);
    database.sqlite.exec("INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total) VALUES('review-item','review-order','product','Product',1,500,500)");
    const eligible = await (await history(request('/api/account/orders', undefined, c.cookie))).json() as any;
    expect(eligible.reviewItems).toEqual([expect.objectContaining({ item_id: 'review-item', order_number: 'WR-REVIEW' })]);
    database.sqlite.prepare("INSERT INTO reviews(id,order_item_id,customer_id,product_id,rating,body) VALUES('review','review-item',?,'product',5,'Good')").run(customerId);
    const reviewed = await (await history(request('/api/account/orders', undefined, c.cookie))).json() as any;
    expect(reviewed.reviewItems).toEqual([]);
  });
  it('requires authentication for account, addresses and order history', async () => {
    for (const handler of [account, addresses, history])
      expect((await handler(request('/api/account'))).status).toBe(401);
    expect(
      (await saveAddress(request('/api/account/addresses', {}))).status,
    ).toBe(401);
  });
});
