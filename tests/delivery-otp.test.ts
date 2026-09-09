import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/d1';
import { activeDeliveryOtp, generateDeliveryOtp, overrideDeliveryOtp, revealDeliveryOtp, verifyDeliveryOtp } from '@/lib/services/delivery-otp';
import { updateStop } from '@/lib/services/delivery-workflow';

let database: ReturnType<typeof testDatabase>;
const secret = 'isolated-delivery-otp-secret-at-least-24-chars';
beforeEach(() => {
  database = testDatabase();
  database.sqlite.exec("INSERT INTO delivery_people(id,name,mobile,password_hash) VALUES('driver','Driver','919000000001','x'),('other','Other','919000000009','x'); INSERT INTO customers(id,name,mobile) VALUES('customer','Customer','919000000002'); INSERT INTO customer_addresses(id,customer_id,line1,locality,city,state,pin_code) VALUES('address','customer','One','Area','Bengaluru','Karnataka','560001'); INSERT INTO orders(id,order_number,idempotency_key,customer_id,address_id,status,payment_status,payment_method,subtotal,delivery_amount,total) VALUES('order','WR-OTP','key','customer','address','ready','paid','UPI',500,49,549); INSERT INTO order_items(id,order_id,product_id,product_name,quantity,unit_price,line_total,qc_passed_at,packed_at) VALUES('item','order','product','Product',1,500,500,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP); INSERT INTO delivery_batches(id,person_id,delivery_date,time_window,status) VALUES('batch','driver',date('now'),'Test','active'); INSERT INTO delivery_stops(id,batch_id,order_id,sort_order,status,open_box_accepted_at,payment_recorded_at,proof_id) VALUES('stop','batch','order',1,'pending',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'proof'); UPDATE orders SET status='out_for_delivery' WHERE id='order'; UPDATE delivery_stops SET status='otp_pending' WHERE id='stop';");
});
afterEach(() => database.sqlite.close());

describe('delivery OTP security', () => {
  it('stores a hash, reveals only to the owning customer, verifies once and is consumed on completion', async () => {
    await generateDeliveryOtp(database.db, 'driver', 'stop', secret);
    const stored = await activeDeliveryOtp(database.db, 'stop');
    expect(stored?.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toMatch(/"code":/);
    expect(await revealDeliveryOtp(database.db, 'order', 'not-owner', secret)).toBeNull();
    const visible = await revealDeliveryOtp(database.db, 'order', 'customer', secret);
    expect(visible?.code).toMatch(/^\d{6}$/);
    await expect(verifyDeliveryOtp(database.db, 'other', 'stop', visible!.code)).rejects.toThrow('No active code');
    await verifyDeliveryOtp(database.db, 'driver', 'stop', visible!.code);
    await expect(verifyDeliveryOtp(database.db, 'driver', 'stop', visible!.code)).rejects.toThrow('already been used');
    await updateStop(database.db, 'driver', { stopId: 'stop', action: 'complete' });
    expect(database.sqlite.prepare("SELECT status FROM orders WHERE id='order'").get()!.status).toBe('delivered');
    expect((await activeDeliveryOtp(database.db, 'stop'))?.consumed_at).toBeTruthy();
  });

  it('rejects expired and incorrect codes and limits attempts', async () => {
    const generatedAt = new Date('2026-01-01T00:00:00.000Z');
    await generateDeliveryOtp(database.db, 'driver', 'stop', secret, generatedAt);
    const visible = await revealDeliveryOtp(database.db, 'order', 'customer', secret, new Date('2026-01-01T00:05:00.000Z'));
    await expect(verifyDeliveryOtp(database.db, 'driver', 'stop', visible!.code, new Date('2026-01-01T00:11:00.000Z'))).rejects.toThrow('expired');
    database.sqlite.exec('DELETE FROM delivery_otps; DELETE FROM abuse_limits;');
    await generateDeliveryOtp(database.db, 'driver', 'stop', secret);
    for (let index = 0; index < 4; index++) await expect(verifyDeliveryOtp(database.db, 'driver', 'stop', '000000')).rejects.toThrow('incorrect');
    await expect(verifyDeliveryOtp(database.db, 'driver', 'stop', '000000')).rejects.toThrow('Too many');
  });

  it('requires OTP even for prepaid delivery and audits Admin override', async () => {
    await expect(updateStop(database.db, 'driver', { stopId: 'stop', action: 'complete' })).rejects.toThrow('Verify the customer delivery code');
    await overrideDeliveryOtp(database.db, 'stop', 'Customer device unavailable at the doorstep');
    await updateStop(database.db, 'driver', { stopId: 'stop', action: 'complete' });
    expect(database.sqlite.prepare("SELECT COUNT(*) count FROM admin_audit_events WHERE action='delivery_otp_overridden'").get()!.count).toBe(1);
  });
});
