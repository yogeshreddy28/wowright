import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyCurrentOperationalData, getDataResetPreview, getOperationalClassificationPreview, resetScopes, resetTestData } from '@/lib/services/data-reset';
import { testDatabase } from './helpers/d1';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => database.sqlite.close());

function seed() {
  database.sqlite.exec(`
    INSERT INTO categories(id,slug,name) VALUES('cat','home','Home');
    INSERT INTO products(id,slug,name,short_description,description,category,category_id,base_price,images,publishing_status) VALUES('product','kept-product','Kept product','Kept','Kept','Home','cat',599,'[]','draft');
    INSERT INTO product_images(id,product_id,storage_key,original_name,content_type,size,role) VALUES('image','product','products/kept.webp','kept.webp','image/webp',10,'main');
    INSERT INTO settings(key,value) VALUES('businessName','"WOW RIGHT"');
    INSERT INTO admin_users(id,email,password_hash) VALUES('admin','admin@example.test','hash');
    INSERT INTO delivery_people(id,name,mobile,password_hash) VALUES('driver','Driver','919000000001','hash');
    INSERT INTO ai_provider_settings(id,provider,model) VALUES('ai','openai','gpt-test');

    INSERT INTO customers(id,name,mobile,is_test) VALUES('test-customer','Test customer','919000000002',1),('real-customer','Real customer','919000000003',0);
    INSERT INTO customer_addresses(id,customer_id,line1,locality,city,state,pin_code) VALUES('test-address','test-customer','1 Test','Area','Bengaluru','Karnataka','560001'),('real-address','real-customer','1 Real','Area','Bengaluru','Karnataka','560001');
    INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,status,payment_status,subtotal,delivery_amount,total,is_test) VALUES('test-order','WR-TEST','test-key','test-customer','test-address','ready','paid',599,49,648,1),('real-order','WR-REAL','real-key','real-customer','real-address','ready','paid',599,49,648,0);
    INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total,production_status,qc_passed_at,packed_at) VALUES('test-item','test-order','product','Snapshot',1,599,599,'printing','2026-09-08','2026-09-08'),('real-item','real-order','product','Snapshot',1,599,599,'packed','2026-09-08','2026-09-08');
    INSERT INTO production_allocations(id,order_item_id,production_date,minutes) VALUES('allocation','test-item','2026-09-08',30);
    INSERT INTO delivery_batches(id,person_id,delivery_date,time_window,is_test) VALUES('test-batch','driver','2026-09-08','Morning',1),('real-batch','driver','2026-09-08','Evening',0);
    INSERT INTO delivery_stops(id,batch_id,order_id,sort_order) VALUES('test-stop','test-batch','test-order',1),('real-stop','real-batch','real-order',1);
    INSERT INTO payment_collections(id,order_id,method,amount_due,amount_collected,collected_at) VALUES('payment','test-order','cash',648,648,'2026-09-08');
    INSERT INTO conversations(id,session_id,is_test) VALUES('test-conversation','test-session',1),('real-conversation','real-session',0);
    INSERT INTO conversation_messages(id,conversation_id,role,message) VALUES('message','test-conversation','customer','test');
    INSERT INTO custom_quote_requests(id,request_number,name,mobile,description,is_test) VALUES('test-quote','TEST-Q','Test','919000000002','test',1);
    INSERT INTO analytics_events(id,name,is_test) VALUES('test-event','page_view',1),('test-companion','companion_opened',1),('real-event','page_view',0);
    INSERT INTO commerce_outbox(id,event_name,payload,status,attempts,created_at,is_test) VALUES('test-outbox','ViewContent','{}','pending',0,'2026-09-08',1),('real-outbox','ViewContent','{}','pending',0,'2026-09-08',0);
  `);
}

describe('safe test-data reset', () => {
  it('classifies only the exact unclassified operational snapshot', async () => {
    seed();
    const preview = await getOperationalClassificationPreview(database.db);
    expect(preview.primary.orders).toBe(1);
    expect(preview.primary.customers).toBe(1);
    expect(preview.related.orderItems).toBe(1);
    await classifyCurrentOperationalData(database.db, preview.token);
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM orders WHERE is_test=1').get()?.count).toBe(2);
    expect(database.sqlite.prepare('SELECT COUNT(*) count FROM products').get()?.count).toBe(1);
    expect(database.sqlite.prepare("SELECT COUNT(*) count FROM admin_audit_events WHERE action='operational_data_classified_as_test'").get()?.count).toBe(1);
  });

  it('refuses a stale or invented classification snapshot token', async () => {
    seed();
    await expect(classifyCurrentOperationalData(database.db, 'stale')).rejects.toThrow('OPERATIONAL_DATA_CHANGED');
  });

  it('previews only explicitly marked test data', async () => {
    seed();
    const preview = await getDataResetPreview(database.db);
    expect(preview.eligible.orders).toBe(1);
    expect(preview.eligible.analytics).toBe(1);
    expect(preview.eligible.companion_analytics).toBe(1);
    expect(preview.unclassified.orders).toBe(1);
    expect(preview.preserved.products).toBe(1);
  });

  it('transactionally removes the test operation while preserving catalogue, config, accounts and real data', async () => {
    seed();
    const protectedTables = ['products', 'product_images', 'categories', 'settings', 'admin_users', 'delivery_people', 'ai_provider_settings'] as const;
    const preservedBefore = Object.fromEntries(protectedTables.map((table) => [table, database.sqlite.prepare(`SELECT COUNT(*) count FROM ${table}`).get()?.count]));
    await resetTestData(database.db, [...resetScopes]);
    for (const [table, expected] of [
      ['orders', 1], ['customers', 1], ['conversations', 1], ['analytics_events', 1],
      ['delivery_batches', 1], ['delivery_stops', 1],
      ['commerce_outbox', 1],
    ] as const) {
      expect(database.sqlite.prepare(`SELECT COUNT(*) count FROM ${table}`).get()?.count).toBe(expected);
    }
    for (const table of protectedTables)
      expect(database.sqlite.prepare(`SELECT COUNT(*) count FROM ${table}`).get()?.count).toBe(preservedBefore[table]);
    expect(database.sqlite.prepare("SELECT COUNT(*) count FROM orders WHERE is_test=1").get()?.count).toBe(0);
    expect(database.sqlite.prepare("SELECT COUNT(*) count FROM admin_audit_events WHERE action='test_data_reset'").get()?.count).toBe(1);
  });
});

const authState = vi.hoisted(() => ({ DB: {} as D1Database, allowed: false }));
vi.mock('cloudflare:workers', () => ({ env: authState }));
vi.mock('@/lib/admin-auth', () => ({ verifyAdmin: async () => authState.allowed }));

describe('data reset Admin API authorization', () => {
  it('rejects unauthenticated preview and reset requests', async () => {
    const route = await import('@/app/api/admin/settings/data-reset/route');
    expect((await route.GET(new Request('http://local/api/admin/settings/data-reset'))).status).toBe(401);
    expect((await route.POST(new Request('http://local/api/admin/settings/data-reset', { method: 'POST', body: '{}' }))).status).toBe(401);
    expect((await route.PUT(new Request('http://local/api/admin/settings/data-reset', { method: 'PUT', body: '{}' }))).status).toBe(401);
  });
});
