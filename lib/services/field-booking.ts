import { z } from 'zod';
import { CommerceError } from './launch-rules';

export const fieldLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().max(10000).optional(),
});

export const noOrderReasons = [
  'Price',
  'Not interested',
  'Different products needed',
  'Ask later',
  'Other',
] as const;

export const bookingStatuses = [
  'booked',
  'approved',
  'printing',
  'ready',
  'delivered',
  'paid',
] as const;

export async function ensureFieldBookingSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS retail_shops (id text PRIMARY KEY NOT NULL,name text NOT NULL,phone text NOT NULL,address text NOT NULL,locality text,city text DEFAULT 'Bengaluru' NOT NULL,state text DEFAULT 'Karnataka' NOT NULL,pin_code text NOT NULL,latitude real,longitude real,active integer DEFAULT true NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
    ),
    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_shops_phone ON retail_shops (phone)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_retail_shops_active_name ON retail_shops (active,name)',
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS field_work_sessions (id text PRIMARY KEY NOT NULL,employee_id text NOT NULL,started_at text NOT NULL,ended_at text,status text DEFAULT 'active' NOT NULL,distance_metres real DEFAULT 0 NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (employee_id) REFERENCES delivery_people(id) ON DELETE restrict)`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_field_sessions_employee_date ON field_work_sessions (employee_id,started_at)',
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS field_location_points (id text PRIMARY KEY NOT NULL,session_id text NOT NULL,employee_id text NOT NULL,latitude real NOT NULL,longitude real NOT NULL,accuracy_metres real,recorded_at text NOT NULL,FOREIGN KEY (session_id) REFERENCES field_work_sessions(id) ON DELETE cascade,FOREIGN KEY (employee_id) REFERENCES delivery_people(id) ON DELETE restrict)`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_field_points_session_time ON field_location_points (session_id,recorded_at)',
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS shop_visits (id text PRIMARY KEY NOT NULL,session_id text NOT NULL,employee_id text NOT NULL,shop_id text NOT NULL,checked_in_at text NOT NULL,latitude real NOT NULL,longitude real NOT NULL,accuracy_metres real,distance_from_shop_metres real,requires_review integer DEFAULT false NOT NULL,outcome text DEFAULT 'checked_in' NOT NULL,no_order_reason text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (session_id) REFERENCES field_work_sessions(id) ON DELETE cascade,FOREIGN KEY (employee_id) REFERENCES delivery_people(id) ON DELETE restrict,FOREIGN KEY (shop_id) REFERENCES retail_shops(id) ON DELETE restrict)`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_shop_visits_employee_date ON shop_visits (employee_id,checked_in_at)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_shop_visits_shop_date ON shop_visits (shop_id,checked_in_at)',
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS retail_bookings (id text PRIMARY KEY NOT NULL,booking_number text NOT NULL,shop_id text NOT NULL,employee_id text NOT NULL,visit_id text NOT NULL,status text DEFAULT 'booked' NOT NULL,payment_terms text DEFAULT 'payable_on_delivery' NOT NULL,payment_status text DEFAULT 'unpaid' NOT NULL,total_quantity integer NOT NULL,total_amount integer NOT NULL,booked_at text NOT NULL,approved_at text,delivered_at text,paid_at text,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (shop_id) REFERENCES retail_shops(id) ON DELETE restrict,FOREIGN KEY (employee_id) REFERENCES delivery_people(id) ON DELETE restrict,FOREIGN KEY (visit_id) REFERENCES shop_visits(id) ON DELETE restrict)`,
    ),
    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_booking_number ON retail_bookings (booking_number)',
    ),
    db.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_retail_booking_visit ON retail_bookings (visit_id)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_retail_bookings_employee_date ON retail_bookings (employee_id,booked_at)',
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_retail_bookings_shop_date ON retail_bookings (shop_id,booked_at)',
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS retail_booking_items (id text PRIMARY KEY NOT NULL,booking_id text NOT NULL,product_id text NOT NULL,variant_id text,product_name text NOT NULL,variant_name text NOT NULL,sku text,image_url text,quantity integer NOT NULL,unit_price integer NOT NULL,line_total integer NOT NULL,created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (booking_id) REFERENCES retail_bookings(id) ON DELETE cascade,FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE restrict,FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE restrict)`,
    ),
    db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_retail_booking_items_booking ON retail_booking_items (booking_id)',
    ),
  ]);
}

export function distanceMetres(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
  );
}

export function routeDistance(
  points: Array<{ latitude: number; longitude: number }>,
) {
  return points
    .slice(1)
    .reduce(
      (total, point, index) => total + distanceMetres(points[index], point),
      0,
    );
}

export function fieldBookingNumber(
  random = crypto.getRandomValues(new Uint32Array(1))[0],
) {
  return `WR-B-${String(random % 1_000_000).padStart(6, '0')}`;
}

export function assertBookingStatusTransition(current: string, next: string) {
  const currentIndex = bookingStatuses.indexOf(
    current as (typeof bookingStatuses)[number],
  );
  const nextIndex = bookingStatuses.indexOf(
    next as (typeof bookingStatuses)[number],
  );
  if (currentIndex < 0 || nextIndex !== currentIndex + 1)
    throw new CommerceError('Choose the next booking stage in order.');
}

export function productKind(product: {
  name: string;
  category: string;
  tags?: string;
}) {
  const haystack =
    `${product.name} ${product.category} ${product.tags || ''}`.toLowerCase();
  return haystack.includes('keychain') || haystack.includes('key chain')
    ? 'keychains'
    : 'models';
}
