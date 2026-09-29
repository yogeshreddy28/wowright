import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import {
  assertBengaluru,
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import {
  assertBookingStatusTransition,
  bookingStatuses,
} from '@/lib/services/field-booking';

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [days, visits, bookings, shops] = await env.DB.batch([
      env.DB.prepare(`SELECT s.id,s.employee_id,p.name employee_name,s.started_at,s.ended_at,s.status,s.distance_metres,
        (SELECT COUNT(*) FROM shop_visits v WHERE v.session_id=s.id) shops_visited,
        (SELECT COUNT(*) FROM retail_bookings b WHERE b.employee_id=s.employee_id AND b.booked_at>=s.started_at AND (s.ended_at IS NULL OR b.booked_at<=s.ended_at)) bookings,
        (SELECT COUNT(*) FROM shop_visits v WHERE v.session_id=s.id AND v.outcome='no_order') no_orders,
        (SELECT COALESCE(SUM(b.total_quantity),0) FROM retail_bookings b WHERE b.employee_id=s.employee_id AND b.booked_at>=s.started_at AND (s.ended_at IS NULL OR b.booked_at<=s.ended_at)) pieces,
        (SELECT COALESCE(SUM(b.total_amount),0) FROM retail_bookings b WHERE b.employee_id=s.employee_id AND b.booked_at>=s.started_at AND (s.ended_at IS NULL OR b.booked_at<=s.ended_at)) booking_value
        FROM field_work_sessions s JOIN delivery_people p ON p.id=s.employee_id ORDER BY s.started_at DESC LIMIT 100`),
      env.DB.prepare(`SELECT v.*,s.name shop_name,p.name employee_name
        FROM shop_visits v JOIN retail_shops s ON s.id=v.shop_id JOIN delivery_people p ON p.id=v.employee_id
        ORDER BY v.checked_in_at DESC LIMIT 200`),
      env.DB.prepare(`SELECT b.*,s.name shop_name,p.name employee_name,
        (SELECT json_group_array(json_object('productName',i.product_name,'variantName',i.variant_name,'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total)) FROM retail_booking_items i WHERE i.booking_id=b.id) items
        FROM retail_bookings b JOIN retail_shops s ON s.id=b.shop_id JOIN delivery_people p ON p.id=b.employee_id
        ORDER BY b.booked_at DESC LIMIT 200`),
      env.DB.prepare('SELECT * FROM retail_shops ORDER BY active DESC,name'),
    ]);
    return Response.json({
      days: days.results,
      visits: visits.results,
      bookings: bookings.results,
      shops: shops.results,
      statuses: bookingStatuses,
    });
  } catch (error) {
    return safeError(error, 'Field activity could not be loaded.');
  }
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create_shop'),
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(1),
    address: z.string().trim().min(5).max(300),
    locality: z.string().trim().max(100).optional().default(''),
    city: z.string().trim().min(2).max(80).default('Bengaluru'),
    state: z.string().trim().min(2).max(80).default('Karnataka'),
    pinCode: z.string().trim().regex(/^560\d{3}$/),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
  }),
  z.object({
    action: z.literal('advance_booking'),
    bookingId: z.string().min(1),
    status: z.enum(bookingStatuses),
  }),
]);

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const input = actionSchema.parse(await request.json());
    const now = new Date().toISOString();
    if (input.action === 'create_shop') {
      const phone = normalizeIndianPhone(input.phone);
      if ((input.latitude == null) !== (input.longitude == null))
        throw new CommerceError('Set both shop latitude and longitude.');
      if (input.latitude != null && input.longitude != null)
        assertBengaluru({
          city: input.city,
          state: input.state,
          pinCode: input.pinCode,
          latitude: input.latitude,
          longitude: input.longitude,
        });
      const existing = await env.DB
        .prepare('SELECT id FROM retail_shops WHERE phone=?')
        .bind(phone)
        .first();
      if (existing)
        throw new CommerceError('A registered shop already uses this phone number.', 409);
      await env.DB.prepare(
        'INSERT INTO retail_shops (id,name,phone,address,locality,city,state,pin_code,latitude,longitude,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      )
        .bind(
          crypto.randomUUID(),
          input.name,
          phone,
          input.address,
          input.locality || null,
          input.city,
          input.state,
          input.pinCode,
          input.latitude ?? null,
          input.longitude ?? null,
          now,
          now,
        )
        .run();
      return Response.json({ ok: true });
    }
    const booking = await env.DB
      .prepare('SELECT status FROM retail_bookings WHERE id=?')
      .bind(input.bookingId)
      .first<{ status: string }>();
    if (!booking) throw new CommerceError('Booking not found.', 404);
    assertBookingStatusTransition(booking.status, input.status);
    await env.DB.prepare(`UPDATE retail_bookings SET status=?,payment_status=CASE WHEN ?='paid' THEN 'paid' ELSE payment_status END,
      approved_at=CASE WHEN ?='approved' THEN ? ELSE approved_at END,
      delivered_at=CASE WHEN ?='delivered' THEN ? ELSE delivered_at END,
      paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_at=? WHERE id=?`)
      .bind(
        input.status,
        input.status,
        input.status,
        now,
        input.status,
        now,
        input.status,
        now,
        now,
        input.bookingId,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return safeError(error, 'Field booking update could not be saved.');
  }
}
