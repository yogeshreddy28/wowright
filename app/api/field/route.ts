import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { deliveryPerson } from '@/lib/delivery-auth';
import { sameOrigin, safeError, CommerceError } from '@/lib/services/launch-rules';
import {
  distanceMetres,
  fieldBookingNumber,
  fieldLocationSchema,
  noOrderReasons,
  productKind,
  routeDistance,
} from '@/lib/services/field-booking';

type Row = Record<string, any>;

async function activeSession(db: D1Database, employeeId: string) {
  return db
    .prepare(
      "SELECT * FROM field_work_sessions WHERE employee_id=? AND status='active' ORDER BY started_at DESC LIMIT 1",
    )
    .bind(employeeId)
    .first<Row>();
}

async function createBookingNumber(db: D1Database) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const value = fieldBookingNumber();
    const found = await db
      .prepare('SELECT 1 found FROM retail_bookings WHERE booking_number=?')
      .bind(value)
      .first();
    if (!found) return value;
  }
  throw new CommerceError('Could not create a booking number. Try again.', 503);
}

export async function GET(request: Request) {
  const employee = await deliveryPerson(request, env.DB);
  if (!employee) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const session = await activeSession(env.DB, employee.id);
    const [shops, products, variants, visits, bookings] = await env.DB.batch([
      env.DB.prepare(`SELECT s.*,
        (SELECT COUNT(*) FROM retail_bookings b WHERE b.shop_id=s.id) previous_bookings,
        (SELECT b.booking_number FROM retail_bookings b WHERE b.shop_id=s.id ORDER BY b.booked_at DESC LIMIT 1) last_booking_number
        FROM retail_shops s WHERE s.active=1 ORDER BY s.name`),
      env.DB.prepare(`SELECT p.id,p.name,p.category,p.base_price,p.tags,
        COALESCE((SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.product_id=p.id ORDER BY CASE i.role WHEN 'main' THEN 0 ELSE 1 END,i.sort_order LIMIT 1),json_extract(p.images,'$[0]')) image
        FROM products p WHERE p.active=1 AND p.publishing_status='published' AND p.availability='available' ORDER BY p.name`),
      env.DB.prepare(`SELECT v.id,v.product_id,COALESCE(f.name,v.name) name,v.sku,
        COALESCE(v.selling_price,p.base_price+COALESCE(v.price_adjustment,0)) price,
        COALESCE((SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.id=v.exact_image_id),(SELECT '/api/product-images/'||i.id FROM product_variant_images vi JOIN product_images i ON i.id=vi.image_id WHERE vi.variant_id=v.id ORDER BY vi.sort_order LIMIT 1)) image
        FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN global_finishes f ON f.id=v.finish_id
        WHERE v.active=1 AND COALESCE(v.availability,'available')='available' AND p.active=1 AND p.publishing_status='published' AND p.availability='available'
        ORDER BY v.sort_order,v.created_at`),
      env.DB.prepare(
        "SELECT v.*,s.name shop_name FROM shop_visits v JOIN retail_shops s ON s.id=v.shop_id WHERE v.employee_id=? AND date(v.checked_in_at)=date('now') ORDER BY v.checked_in_at DESC",
      ).bind(employee.id),
      env.DB.prepare(`SELECT b.*,s.name shop_name,
        (SELECT json_group_array(json_object('productName',i.product_name,'variantName',i.variant_name,'quantity',i.quantity,'unitPrice',i.unit_price,'lineTotal',i.line_total)) FROM retail_booking_items i WHERE i.booking_id=b.id) items
        FROM retail_bookings b JOIN retail_shops s ON s.id=b.shop_id WHERE b.employee_id=? ORDER BY b.booked_at DESC LIMIT 30`).bind(employee.id),
    ]);
    const variantRows = variants.results as Row[];
    return Response.json({
      employee,
      session,
      shops: shops.results,
      products: (products.results as Row[]).map((product) => {
        const productVariants = variantRows.filter(
          (variant) => variant.product_id === product.id,
        );
        return {
          ...product,
          kind: productKind({
            name: String(product.name),
            category: String(product.category),
            tags: String(product.tags || ''),
          }),
          variants: productVariants.length
            ? productVariants
            : [
                {
                  id: null,
                  product_id: product.id,
                  name: 'Standard',
                  sku: null,
                  price: Number(product.base_price),
                  image: null,
                },
              ],
        };
      }),
      visits: visits.results,
      bookings: bookings.results,
    });
  } catch (error) {
    return safeError(error, 'Field workspace could not be loaded.');
  }
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_day'), location: fieldLocationSchema.optional() }),
  z.object({ action: z.literal('end_day'), location: fieldLocationSchema.optional() }),
  z.object({
    action: z.literal('track_point'),
    location: fieldLocationSchema,
    recordedAt: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal('check_in'), shopId: z.string().min(1), location: fieldLocationSchema }),
  z.object({
    action: z.literal('no_order'),
    visitId: z.string().min(1),
    reason: z.enum(noOrderReasons),
  }),
  z.object({
    action: z.literal('confirm_booking'),
    visitId: z.string().min(1),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1),
          variantId: z.string().min(1).nullable(),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(100),
  }),
]);

async function savePoint(
  db: D1Database,
  session: Row,
  employeeId: string,
  location: z.infer<typeof fieldLocationSchema>,
  recordedAt = new Date().toISOString(),
) {
  const latest = await db
    .prepare(
      'SELECT latitude,longitude,recorded_at FROM field_location_points WHERE session_id=? ORDER BY recorded_at DESC LIMIT 1',
    )
    .bind(session.id)
    .first<Row>();
  if (
    latest &&
    Date.parse(recordedAt) - Date.parse(latest.recorded_at) < 45_000 &&
    distanceMetres(location, {
      latitude: Number(latest.latitude),
      longitude: Number(latest.longitude),
    }) < 50
  )
    return false;
  await db
    .prepare(
      'INSERT INTO field_location_points (id,session_id,employee_id,latitude,longitude,accuracy_metres,recorded_at) VALUES (?,?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      session.id,
      employeeId,
      location.latitude,
      location.longitude,
      location.accuracy ?? null,
      recordedAt,
    )
    .run();
  return true;
}

export async function POST(request: Request) {
  const employee = await deliveryPerson(request, env.DB);
  if (!employee) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const input = actionSchema.parse(await request.json());
    const now = new Date().toISOString();
    let session = await activeSession(env.DB, employee.id);

    if (input.action === 'start_day') {
      if (session) throw new CommerceError('Your field day is already active.');
      session = { id: crypto.randomUUID() };
      await env.DB.prepare(
        "INSERT INTO field_work_sessions (id,employee_id,started_at,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)",
      )
        .bind(session.id, employee.id, now, now, now)
        .run();
      if (input.location) await savePoint(env.DB, session, employee.id, input.location, now);
      return Response.json({ ok: true, sessionId: session.id });
    }
    if (!session) throw new CommerceError('Start your field day first.');

    if (input.action === 'track_point') {
      const recordedAt = input.recordedAt || now;
      if (Math.abs(Date.now() - Date.parse(recordedAt)) > 10 * 60_000)
        throw new CommerceError('Location point is too old.');
      return Response.json({ saved: await savePoint(env.DB, session, employee.id, input.location, recordedAt) });
    }
    if (input.action === 'end_day') {
      if (input.location) await savePoint(env.DB, session, employee.id, input.location, now);
      const points = await env.DB
        .prepare(
          'SELECT latitude,longitude FROM field_location_points WHERE session_id=? ORDER BY recorded_at',
        )
        .bind(session.id)
        .all<{ latitude: number; longitude: number }>();
      const travelled = routeDistance(points.results);
      await env.DB.prepare(
        "UPDATE field_work_sessions SET status='ended',ended_at=?,distance_metres=?,updated_at=? WHERE id=? AND status='active'",
      )
        .bind(now, travelled, now, session.id)
        .run();
      return Response.json({ ok: true, distanceMetres: travelled });
    }
    if (input.action === 'check_in') {
      const shop = await env.DB
        .prepare('SELECT * FROM retail_shops WHERE id=? AND active=1')
        .bind(input.shopId)
        .first<Row>();
      if (!shop) throw new CommerceError('Shop is unavailable.', 404);
      const distance =
        shop.latitude == null || shop.longitude == null
          ? null
          : distanceMetres(input.location, {
              latitude: Number(shop.latitude),
              longitude: Number(shop.longitude),
            });
      const id = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO shop_visits (id,session_id,employee_id,shop_id,checked_in_at,latitude,longitude,accuracy_metres,distance_from_shop_metres,requires_review,outcome,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?, 'checked_in',?,?)",
        ).bind(
          id,
          session.id,
          employee.id,
          shop.id,
          now,
          input.location.latitude,
          input.location.longitude,
          input.location.accuracy ?? null,
          distance,
          distance != null && distance > 250 ? 1 : 0,
          now,
          now,
        ),
        env.DB.prepare(
          'INSERT INTO field_location_points (id,session_id,employee_id,latitude,longitude,accuracy_metres,recorded_at) VALUES (?,?,?,?,?,?,?)',
        ).bind(
          crypto.randomUUID(),
          session.id,
          employee.id,
          input.location.latitude,
          input.location.longitude,
          input.location.accuracy ?? null,
          now,
        ),
      ]);
      return Response.json({ visitId: id, distanceMetres: distance, requiresReview: distance != null && distance > 250 });
    }
    const visit = await env.DB
      .prepare(
        "SELECT * FROM shop_visits WHERE id=? AND employee_id=? AND session_id=? AND outcome='checked_in'",
      )
      .bind(input.visitId, employee.id, session.id)
      .first<Row>();
    if (!visit) throw new CommerceError('Check in again before saving this visit.');
    if (input.action === 'no_order') {
      await env.DB.prepare(
        "UPDATE shop_visits SET outcome='no_order',no_order_reason=?,updated_at=? WHERE id=?",
      )
        .bind(input.reason, now, visit.id)
        .run();
      return Response.json({ ok: true });
    }

    const catalogRows = await env.DB.batch(
      input.lines.map((line) =>
        env.DB.prepare(`SELECT p.id product_id,p.name product_name,p.base_price,p.images,
          v.id variant_id,COALESCE(f.name,v.name,'Standard') variant_name,v.sku,
          COALESCE(v.selling_price,p.base_price+COALESCE(v.price_adjustment,0),p.base_price) unit_price,
          COALESCE((SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.id=v.exact_image_id),(SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.product_id=p.id ORDER BY CASE i.role WHEN 'main' THEN 0 ELSE 1 END,i.sort_order LIMIT 1),json_extract(p.images,'$[0]')) image_url
          FROM products p LEFT JOIN product_variants v ON v.id=? AND v.product_id=p.id LEFT JOIN global_finishes f ON f.id=v.finish_id
          WHERE p.id=? AND p.active=1 AND p.publishing_status='published' AND p.availability='available'
          AND (? IS NULL OR (v.active=1 AND COALESCE(v.availability,'available')='available'))
          AND (? IS NOT NULL OR NOT EXISTS (SELECT 1 FROM product_variants vx WHERE vx.product_id=p.id AND vx.active=1 AND COALESCE(vx.availability,'available')='available'))`).bind(
          line.variantId,
          line.productId,
          line.variantId,
          line.variantId,
        ),
      ),
    );
    const items = catalogRows.map((result, index) => {
      const row = result.results[0] as Row | undefined;
      const requested = input.lines[index];
      if (!row || (requested.variantId && row.variant_id !== requested.variantId))
        throw new CommerceError('A selected product or colour is unavailable.');
      const price = Number(row.unit_price);
      if (!Number.isSafeInteger(price) || price <= 0)
        throw new CommerceError('A selected product does not have a valid fixed price.');
      return {
        ...row,
        quantity: requested.quantity,
        lineTotal: price * requested.quantity,
      } as Row & { quantity: number; lineTotal: number };
    });
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const id = crypto.randomUUID();
    const bookingNumber = await createBookingNumber(env.DB);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO retail_bookings (id,booking_number,shop_id,employee_id,visit_id,status,payment_terms,payment_status,total_quantity,total_amount,booked_at,created_at,updated_at) VALUES (?,?,?,?,?,'booked','payable_on_delivery','unpaid',?,?,?,?,?)",
      ).bind(
        id,
        bookingNumber,
        visit.shop_id,
        employee.id,
        visit.id,
        totalQuantity,
        totalAmount,
        now,
        now,
        now,
      ),
      ...items.map((item) =>
        env.DB.prepare(
          'INSERT INTO retail_booking_items (id,booking_id,product_id,variant_id,product_name,variant_name,sku,image_url,quantity,unit_price,line_total,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          crypto.randomUUID(),
          id,
          item.product_id,
          item.variant_id ?? null,
          item.product_name,
          item.variant_name,
          item.sku ?? null,
          item.image_url ?? null,
          item.quantity,
          item.unit_price,
          item.lineTotal,
          now,
        ),
      ),
      env.DB.prepare(
        "UPDATE shop_visits SET outcome='booked',updated_at=? WHERE id=?",
      ).bind(now, visit.id),
    ]);
    return Response.json({ bookingNumber, totalQuantity, totalAmount });
  } catch (error) {
    return safeError(error, 'Field update could not be saved.');
  }
}
