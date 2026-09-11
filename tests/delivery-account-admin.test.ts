import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';

const state = vi.hoisted(() => ({ DB: {} as D1Database, allowed: true }));
vi.mock('cloudflare:workers', () => ({ env: state }));
vi.mock('@/lib/admin-auth', () => ({ verifyAdmin: async () => state.allowed }));

import { POST as manageDelivery } from '@/app/api/admin/delivery/route';
import { POST as deliveryLogin } from '@/app/api/delivery/login/route';

let database: ReturnType<typeof testDatabase>;

beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
  state.allowed = true;
});

afterEach(() => database.sqlite.close());

function request(path: string, body: unknown) {
  return new Request(`http://local${path}`, {
    method: 'POST',
    headers: { origin: 'http://local', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPerson = {
  action: 'person',
  name: 'Temporary delivery QA',
  phone: '90000 00021',
  password: 'temporary-password-21',
};

describe('Admin delivery-account management', () => {
  it('requires Admin authentication', async () => {
    state.allowed = false;
    const response = await manageDelivery(
      request('/api/admin/delivery', validPerson),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM delivery_people').get()
        ?.count,
    ).toBe(0);
  });

  it('creates a normalized account with a password hash and permits delivery login', async () => {
    const response = await manageDelivery(
      request('/api/admin/delivery', validPerson),
    );
    expect(response.status).toBe(200);
    const stored = database.sqlite
      .prepare('SELECT mobile,password_hash,active FROM delivery_people')
      .get() as Record<string, unknown>;
    expect(stored.mobile).toBe('919000000021');
    expect(stored.password_hash).not.toBe(validPerson.password);
    expect(String(stored.password_hash)).toMatch(/^scrypt\$/);
    expect(stored.active).toBe(1);

    const login = await deliveryLogin(
      request('/api/delivery/login', {
        phone: validPerson.phone,
        password: validPerson.password,
      }),
    );
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('wow_delivery_session=');
  });

  it('returns safe, useful validation and duplicate messages', async () => {
    const shortPassword = await manageDelivery(
      request('/api/admin/delivery', { ...validPerson, password: 'short' }),
    );
    expect(shortPassword.status).toBe(400);
    expect(await shortPassword.json()).toEqual({
      error: 'Password must be at least 12 characters.',
    });

    const invalidPhone = await manageDelivery(
      request('/api/admin/delivery', { ...validPerson, phone: '1234' }),
    );
    expect(invalidPhone.status).toBe(400);
    expect(await invalidPhone.json()).toEqual({
      error: 'Enter a valid 10-digit Indian mobile number.',
    });

    expect(
      (
        await manageDelivery(request('/api/admin/delivery', validPerson))
      ).status,
    ).toBe(200);
    const duplicate = await manageDelivery(
      request('/api/admin/delivery', {
        ...validPerson,
        name: 'Another person',
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: 'This mobile number already has a delivery account.',
    });
  });
});
