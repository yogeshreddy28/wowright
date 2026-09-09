import type { OperationOrder } from './order-mutation';
import { createHashToken } from '@/lib/session-tokens';
type TrackedOrder = Pick<
  OperationOrder,
  'id' | 'total' | 'session_id' | 'is_test'
> &
  Partial<OperationOrder>;
// Prepare outside a transaction, then insert alongside the business change.
// The CAS operation token gates events exactly like payment and order-item writes.
export async function prepareCommerceEvent(
  db: D1Database,
  order: TrackedOrder,
  name: string,
  explicitConsent?: boolean,
) {
  if (order.is_test) return (_token?: string): D1PreparedStatement[] => [];
  const id = `${order.id}:${name}`,
    now = new Date().toISOString();
  const stored =
    explicitConsent === undefined
      ? await db
          .prepare(
            'SELECT campaign_attribution,session_id FROM orders WHERE id=?',
          )
          .bind(order.id)
          .first<{
            campaign_attribution: string | null;
            session_id: string | null;
          }>()
      : null;
  let consent = explicitConsent === true;
  if (explicitConsent === undefined)
    try {
      consent =
        JSON.parse(stored?.campaign_attribution || '{}').analyticsConsent ===
        true;
    } catch {}
  const sessionId = order.session_id || stored?.session_id || null;
  const payload = JSON.stringify({
    event_id: id,
    event_name: name,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: process.env.SITE_URL || 'http://localhost:3000',
    user_data: {
      external_id: sessionId ? [await createHashToken(sessionId)] : [],
    },
    custom_data: { value: order.total, currency: 'INR' },
    consent,
  });
  return (token?: string): D1PreparedStatement[] => [
    db
      .prepare(
        'INSERT OR IGNORE INTO analytics_events(id,session_id,name,order_id,metadata,created_at) SELECT ?,?,?,?,?,? FROM orders WHERE id=? AND (? IS NULL OR last_operation_id=?)',
      )
      .bind(
        id,
        sessionId,
        name,
        order.id,
        payload,
        now,
        order.id,
        token || null,
        token || null,
      ),
    db
      .prepare(
        'INSERT OR IGNORE INTO commerce_outbox(id,event_name,order_id,payload,created_at) SELECT ?,?,?,?,? FROM orders WHERE id=? AND (? IS NULL OR last_operation_id=?)',
      )
      .bind(
        id,
        name,
        order.id,
        payload,
        now,
        order.id,
        token || null,
        token || null,
      ),
  ];
}
export async function recordCommerceEvent(
  db: D1Database,
  order: TrackedOrder,
  name: string,
) {
  const statements = (await prepareCommerceEvent(db, order, name))();
  if (statements.length) await db.batch(statements);
}
