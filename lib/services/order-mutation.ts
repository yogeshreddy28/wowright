import { CommerceError } from './launch-rules';
export type OperationOrder = {
  id: string;
  order_number: string;
  customer_id: string;
  session_id: string | null;
  status: string;
  payment_status: string;
  payment_method: string;
  total: number;
  revision: number;
  order_type: string;
  is_test: number;
  [key: string]: unknown;
};
export async function readOperationOrder(db: D1Database, id: string) {
  const order = await db
    .prepare('SELECT * FROM orders WHERE id=? OR order_number=?')
    .bind(id, id)
    .first<OperationOrder>();
  if (!order) throw new CommerceError('Order not found.', 404);
  return order;
}
// All dependent writes share the unique operation token inside one D1 transaction.
// A stale operation changes nothing, including item states, payments and timeline.
export async function mutateOrder(
  db: D1Database,
  order: OperationOrder,
  change: {
    status?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    note: string;
    actor: string;
    extra?: Record<string, string | number | null>;
  },
  dependent?: (token: string) => D1PreparedStatement[],
) {
  const token = crypto.randomUUID(),
    now = new Date().toISOString();
  const allowed = new Set([
    'internal_notes',
    'estimated_delivery_date',
    'promised_delivery_date',
    'delivery_window',
    'delivered_at',
  ]);
  const entries = Object.entries(change.extra || {});
  if (entries.some(([key]) => !allowed.has(key)))
    throw new Error('Unsupported internal mutation');
  const results = await db.batch([
    db
      .prepare(
        `UPDATE orders SET status=?,payment_status=?,payment_method=?,revision=revision+1,last_operation_id=?,updated_at=?${entries.map(([key]) => `,${key}=?`).join('')} WHERE id=? AND revision=?`,
      )
      .bind(
        change.status || order.status,
        change.paymentStatus || order.payment_status,
        change.paymentMethod || order.payment_method,
        token,
        now,
        ...entries.map(([, value]) => value),
        order.id,
        order.revision,
      ),
    ...(dependent?.(token) || []),
    db
      .prepare(
        'INSERT INTO order_timeline (id,order_id,from_status,to_status,note,actor,created_at) SELECT ?,id,?,?,?,?,? FROM orders WHERE id=? AND last_operation_id=?',
      )
      .bind(
        crypto.randomUUID(),
        order.status,
        change.status || order.status,
        change.note,
        change.actor,
        now,
        order.id,
        token,
      ),
  ]);
  if (!results[0]?.meta.changes)
    throw new CommerceError(
      'This order changed. Refresh it before trying again.',
      409,
    );
}
