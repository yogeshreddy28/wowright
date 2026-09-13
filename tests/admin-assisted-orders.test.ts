import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/d1';
import {
  createAssistedOrder,
  previewAssistedOrder,
} from '@/lib/services/assisted-orders';
import { sha256 } from '@/lib/customer-auth';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  database.sqlite.exec(`
    INSERT INTO products(id,slug,name,short_description,description,category,base_price,active,featured,stock_mode,lead_time,status,publishing_status,availability,sku,estimated_print_minutes,internal_unit_cost)
    VALUES('product-1','fixture','Fixture Product','Short','Description','Home Decor',599,1,0,'made_to_order','Owner configured','active','published','available','WR-HOME-001',30,120);
    INSERT INTO product_variants(id,product_id,name,sku,price_adjustment,finish_id,selling_price,availability,active)
    VALUES('variant-black','product-1','Premium Black','WR-HOME-001-BLK',0,NULL,649,'available',1);
  `);
});
afterEach(() => database.sqlite.close());

function order(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: crypto.randomUUID(),
    customer: {
      mobile: '8105220349',
      name: 'WhatsApp Customer',
      email: 'buyer@example.test',
    },
    address: {
      label: 'Home',
      line1: '1 Test Road',
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pinCode: '560038',
      latitude: 12.9719,
      longitude: 77.6412,
    },
    items: [
      {
        productId: 'product-1',
        variantId: 'variant-black',
        quantity: 1,
        discount: 0,
      },
    ],
    orderDiscount: 0,
    paymentMethod: 'COD',
    source: 'whatsapp',
    attribution: {},
    ...overrides,
  };
}

describe('Admin-assisted authoritative order creation', () => {
  it('normalizes mobile, snapshots the selected finish/SKU and enters normal fulfillment', async () => {
    const result = await createAssistedOrder(database.db, order());
    expect(result).toMatchObject({
      status: 'confirmed',
      payment_status: 'cod',
      total: 698,
      customerMobile: '918105220349',
    });
    const line = database.sqlite
      .prepare(
        'SELECT product_sku,selected_finish,unit_price,line_total FROM order_items',
      )
      .get();
    expect(line).toMatchObject({
      product_sku: 'WR-HOME-001-BLK',
      selected_finish: 'Premium Black',
      unit_price: 649,
      line_total: 649,
    });
    expect(
      database.sqlite.prepare('SELECT source,created_by FROM orders').get(),
    ).toMatchObject({ source: 'whatsapp', created_by: 'admin' });
    expect(
      database.sqlite
        .prepare('SELECT count(*) count FROM production_allocations')
        .get()!.count,
    ).toBeGreaterThan(0);
  });

  it('reuses one normalized customer for later Admin orders', async () => {
    const first = await createAssistedOrder(database.db, order());
    const second = await createAssistedOrder(
      database.db,
      order({
        idempotencyKey: crypto.randomUUID(),
        customer: {
          mobile: '+91 81052 20349',
          name: 'WhatsApp Customer',
          email: 'buyer@example.test',
        },
      }),
    );
    expect(first.customerId).toBe(second.customerId);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM customers').get()!
        .count,
    ).toBe(1);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM orders').get()!.count,
    ).toBe(2);
  });

  it('requires an audit reason for all price, discount, delivery and minimum overrides', async () => {
    await expect(
      previewAssistedOrder(
        database.db,
        order({
          items: [
            {
              productId: 'product-1',
              variantId: 'variant-black',
              quantity: 1,
              unitPriceOverride: 500,
              discount: 0,
            },
          ],
        }),
      ),
    ).rejects.toThrow('reason');
    const result = await createAssistedOrder(
      database.db,
      order({
        items: [
          {
            productId: 'product-1',
            variantId: 'variant-black',
            quantity: 1,
            unitPriceOverride: 500,
            discount: 0,
          },
        ],
        overrideReason: 'Agreed WhatsApp offer',
      }),
    );
    expect(result.total).toBe(549);
    const audit = JSON.parse(
      String(
        database.sqlite.prepare('SELECT metadata FROM order_audit_log').get()!
          .metadata,
      ),
    );
    expect(audit).toMatchObject({
      overrideReason: 'Agreed WhatsApp offer',
      catalogueSubtotal: 649,
    });
  });

  it('stores only a tracking-token hash and returns no private data from the token record', async () => {
    const result = await createAssistedOrder(database.db, order());
    const row = database.sqlite
      .prepare('SELECT token_hash FROM order_tracking_tokens')
      .get() as { token_hash: string };
    expect(row.token_hash).toBe(await sha256(result.trackingToken));
    expect(row.token_hash).not.toContain(result.trackingToken);
  });

  it('keeps custom/quote-only products prepaid-only', async () => {
    database.sqlite
      .prepare(
        "UPDATE products SET product_type='customizable',stock_mode='quote_only' WHERE id='product-1'",
      )
      .run();
    await expect(previewAssistedOrder(database.db, order())).rejects.toThrow(
      'received UPI',
    );
    await expect(
      previewAssistedOrder(
        database.db,
        order({ paymentMethod: 'UPI', upiStatus: 'payment_pending' }),
      ),
    ).rejects.toThrow('received UPI');
    const result = await createAssistedOrder(
      database.db,
      order({ paymentMethod: 'UPI', upiStatus: 'payment_received' }),
    );
    expect(result).toMatchObject({
      status: 'confirmed',
      payment_status: 'paid',
    });
  });

  it('is idempotent and never creates duplicate orders from repeated submits', async () => {
    const payload = order();
    const first = await createAssistedOrder(database.db, payload);
    const retry = await createAssistedOrder(database.db, payload);
    expect(retry.order_number).toBe(first.order_number);
    expect(retry.duplicate).toBe(true);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM orders').get()!.count,
    ).toBe(1);
  });
});
