import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import {
  assertBookingStatusTransition,
  distanceMetres,
  fieldBookingNumber,
  routeDistance,
} from '@/lib/services/field-booking';

const state = vi.hoisted(() => ({
  DB: {} as D1Database,
  employee: { id: 'employee-1', name: 'Field Employee', mobile: '919000000001' } as any,
  admin: true,
}));
vi.mock('cloudflare:workers', () => ({ env: state }));
vi.mock('@/lib/delivery-auth', () => ({ deliveryPerson: async () => state.employee }));
vi.mock('@/lib/admin-auth', () => ({ verifyAdmin: async () => state.admin }));

import { GET as getField, POST as postField } from '@/app/api/field/route';
import {
  GET as getAdminField,
  POST as postAdminField,
} from '@/app/api/admin/field/route';

let database: ReturnType<typeof testDatabase>;

function request(path: string, body: unknown) {
  return new Request(`http://local${path}`, {
    method: 'POST',
    headers: { origin: 'http://local', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
  state.admin = true;
  state.employee = { id: 'employee-1', name: 'Field Employee', mobile: '919000000001' };
  database.sqlite.exec(`
    INSERT INTO delivery_people(id,name,mobile,password_hash) VALUES('employee-1','Field Employee','919000000001','hash');
    INSERT INTO products(id,slug,sku,name,short_description,description,category,category_id,base_price,active,status,publishing_status,availability,stock_mode,lead_time,images,commercial_license_status)
      VALUES('product','knight','WR-HOME-1','Knight Pen Holder','','','Home Decor','cat_home_decor',379,1,'active','published','available','made_to_order','','[]','commercial_verified');
    INSERT INTO product_variants(id,product_id,name,sku,selling_price,active,availability,sort_order)
      VALUES('black','product','Black','WR-HOME-1-BLK',379,1,'available',0),('copper','product','Copper Silk','WR-HOME-1-COP',399,1,'available',1);
    INSERT INTO retail_shops(id,name,phone,address,locality,city,state,pin_code,latitude,longitude)
      VALUES('shop','Test Retail Shop','919000000002','12 Market Road','Indiranagar','Bengaluru','Karnataka','560038',12.9719,77.6412);
  `);
});

afterEach(() => database.sqlite.close());

describe('retail field booking', () => {
  it('calculates route and shop distances', () => {
    expect(distanceMetres({ latitude: 12.9716, longitude: 77.5946 }, { latitude: 12.9726, longitude: 77.5946 })).toBeGreaterThan(100);
    expect(routeDistance([{ latitude: 12.9716, longitude: 77.5946 }, { latitude: 12.9726, longitude: 77.5946 }])).toBeGreaterThan(100);
    expect(fieldBookingNumber(42)).toBe('WR-B-000042');
  });

  it('creates a check-in and server-priced multi-colour booking', async () => {
    expect((await postField(request('/api/field', { action: 'start_day', location: { latitude: 12.9719, longitude: 77.6412, accuracy: 10 } }))).status).toBe(200);
    const checkIn = await postField(request('/api/field', { action: 'check_in', shopId: 'shop', location: { latitude: 12.97191, longitude: 77.6412, accuracy: 8 } }));
    expect(checkIn.status).toBe(200);
    const visit = await checkIn.json() as any;
    expect(visit.distanceMetres).toBeLessThan(5);

    const missingColour = await postField(request('/api/field', {
      action: 'confirm_booking',
      visitId: visit.visitId,
      lines: [{ productId: 'product', variantId: null, quantity: 1 }],
    }));
    expect(missingColour.status).toBe(400);

    const booking = await postField(request('/api/field', {
      action: 'confirm_booking',
      visitId: visit.visitId,
      lines: [
        { productId: 'product', variantId: 'black', quantity: 3, unitPrice: 1 },
        { productId: 'product', variantId: 'copper', quantity: 2, unitPrice: 1 },
      ],
    }));
    expect(booking.status).toBe(200);
    const result = await booking.json() as any;
    expect(result.bookingNumber).toMatch(/^WR-B-\d{6}$/);
    expect(result.totalQuantity).toBe(5);
    expect(result.totalAmount).toBe(379 * 3 + 399 * 2);
    const stored = database.sqlite.prepare('SELECT status,payment_terms,payment_status,total_amount FROM retail_bookings').get() as any;
    expect(stored).toEqual(expect.objectContaining({ status: 'booked', payment_terms: 'payable_on_delivery', payment_status: 'unpaid', total_amount: 1935 }));
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM retail_booking_items').get()?.count).toBe(2);

    const field = await getField(new Request('http://local/api/field'));
    expect(field.status).toBe(200);
    expect((await field.json() as any).bookings).toHaveLength(1);

    const forbiddenPayment = await postField(
      request('/api/field', {
        action: 'advance_booking',
        bookingId: database.sqlite.prepare('SELECT id FROM retail_bookings').get()?.id,
        status: 'paid',
      }),
    );
    expect(forbiddenPayment.status).toBe(400);

    const end = await postField(
      request('/api/field', {
        action: 'end_day',
        location: { latitude: 12.9729, longitude: 77.6412, accuracy: 12 },
      }),
    );
    expect(end.status).toBe(200);
    expect((await end.json() as any).distanceMetres).toBeGreaterThan(100);

    const admin = await getAdminField(new Request('http://local/api/admin/field'));
    expect(admin.status).toBe(200);
    const dashboard = await admin.json() as any;
    expect(dashboard.days[0]).toEqual(expect.objectContaining({
      employee_name: 'Field Employee',
      status: 'ended',
      shops_visited: 1,
      bookings: 1,
      no_orders: 0,
      pieces: 5,
      booking_value: 1935,
    }));
    expect(dashboard.visits[0].distance_from_shop_metres).toBeLessThan(5);
  });

  it('lets Admin register a normalized shop and exposes it to the employee', async () => {
    database.sqlite.exec("DELETE FROM retail_shops WHERE id='shop'");
    const created = await postAdminField(
      request('/api/admin/field', {
        action: 'create_shop',
        name: 'New Retail Shop',
        phone: '90000 00003',
        address: '25 Retail Street',
        locality: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pinCode: '560038',
        latitude: 12.9719,
        longitude: 77.6412,
      }),
    );
    expect(created.status).toBe(200);
    const shop = database.sqlite
      .prepare('SELECT name,phone,latitude,longitude FROM retail_shops')
      .get() as any;
    expect(shop).toEqual(expect.objectContaining({
      name: 'New Retail Shop',
      phone: '919000000003',
      latitude: 12.9719,
      longitude: 77.6412,
    }));
    const field = await getField(new Request('http://local/api/field'));
    expect((await field.json() as any).shops[0].name).toBe('New Retail Shop');
  });

  it('records a no-order reason and prevents duplicate outcomes', async () => {
    await postField(request('/api/field', { action: 'start_day' }));
    const checkIn = await postField(request('/api/field', { action: 'check_in', shopId: 'shop', location: { latitude: 12.9719, longitude: 77.6412 } }));
    const { visitId } = await checkIn.json() as any;
    expect((await postField(request('/api/field', { action: 'no_order', visitId, reason: 'Ask later' }))).status).toBe(200);
    const repeated = await postField(request('/api/field', { action: 'no_order', visitId, reason: 'Price' }));
    expect(repeated.status).toBe(400);
    expect((database.sqlite.prepare('SELECT outcome,no_order_reason FROM shop_visits').get() as any).no_order_reason).toBe('Ask later');

    const admin = await getAdminField(new Request('http://local/api/admin/field'));
    expect((await admin.json() as any).days[0].no_orders).toBe(1);
  });

  it('starts safely without an initial GPS point', async () => {
    const response = await postField(request('/api/field', { action: 'start_day' }));
    expect(response.status).toBe(200);
    expect(database.sqlite.prepare('SELECT status FROM field_work_sessions').get()?.status).toBe('active');
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM field_location_points').get()?.count).toBe(0);
  });

  it('keeps booking status changes Admin-only and sequential', async () => {
    expect(() => assertBookingStatusTransition('booked', 'printing')).toThrow();
    state.admin = false;
    expect((await postAdminField(request('/api/admin/field', { action: 'create_shop' }))).status).toBe(401);
  });
});
