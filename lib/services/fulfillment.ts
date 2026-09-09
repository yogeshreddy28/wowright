import { z } from 'zod';
import { CommerceError } from './launch-rules';
import { mutateOrder, readOperationOrder } from './order-mutation';
import {
  assertCompletePacking,
  assertQC,
  localDate,
  planOrder,
} from './production';
import { prepareCommerceEvent } from './tracking';

export const productionAction = z.object({
  action: z.enum([
    'schedule',
    'print',
    'print_complete',
    'qc_pass',
    'qc_fail',
    'pack',
    'ready',
    'cancel',
    'reschedule',
    'estimate',
  ]),
  itemId: z.string().max(100).optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  note: z.string().trim().max(1000).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  printMinutes: z.number().int().min(1).max(43200).optional(),
});
type Item = {
  id: string;
  quantity: number;
  production_status: string;
  qc_passed_at: string | null;
  packed_at: string | null;
  estimated_print_minutes: number | null;
  reprint_count: number;
};
export async function fulfill(db: D1Database, id: string, raw: unknown) {
  const data = productionAction.parse(raw),
    order = await readOperationOrder(db, id),
    now = new Date().toISOString();
  const items = (
    await db
      .prepare('SELECT * FROM order_items WHERE order_id=?')
      .bind(order.id)
      .all<Item>()
  ).results;
  const item = items.find((i) => i.id === data.itemId);
  const itemActions = ['print', 'print_complete', 'qc_pass', 'qc_fail', 'pack'];
  if (itemActions.includes(data.action) && !item)
    throw new CommerceError('Choose a line item from this order.');
  if (['cancelled', 'delivered'].includes(order.status))
    throw new CommerceError('This order is closed.');
  if (
    data.action !== 'cancel' &&
    data.action !== 'estimate' &&
    !['paid', 'cod'].includes(order.payment_status)
  )
    throw new CommerceError('Confirm payment before starting production.');
  if (
    order.order_type === 'customizable' &&
    data.action !== 'cancel' &&
    order.payment_status !== 'paid'
  )
    throw new CommerceError('Custom orders must be prepaid in full.');
  let status = order.status;
  let itemSet = '',
    itemValues: unknown[] = [];
  const extra: Record<string, string | number | null> = {};
  let allocations: { itemId: string; date: string; minutes: number }[] = [];
  if (data.action === 'schedule') {
    if (
      !['confirmed', 'order_placed', 'reprint_required', 'delayed'].includes(
        order.status,
      )
    )
      throw new CommerceError('Only waiting work can be scheduled.');
    const existing = await db
      .prepare(
        'SELECT id FROM production_allocations WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id=?) LIMIT 1',
      )
      .bind(order.id)
      .first();
    if (existing)
      throw new CommerceError(
        'This order already has a capacity allocation. Use delivery-estimate override for changes.',
      );
    const plan = await planOrder(db, items);
    if (plan.unknown.length)
      throw new CommerceError(
        'Enter estimated print minutes on every line item before automatic scheduling.',
      );
    allocations = plan.allocations;
    extra.estimated_delivery_date = plan.estimatedDeliveryDate;
  } else if (data.action === 'print') {
    if (!item!.estimated_print_minutes)
      throw new CommerceError(
        'Enter print minutes and allocate production capacity before starting this item.',
      );
    const slot = await db
      .prepare(
        'SELECT COALESCE(SUM(minutes),0) minutes FROM production_allocations WHERE order_item_id=? AND production_date<=?',
      )
      .bind(item!.id, localDate())
      .first<{ minutes: number }>();
    if (
      Number(slot?.minutes || 0) <=
      item!.estimated_print_minutes * item!.quantity * item!.reprint_count
    )
      throw new CommerceError(
        'This print has no available capacity slot yet. Allocate it or wait for its scheduled production day.',
      );
    if (
      !['queued', 'reprint_required'].includes(item!.production_status) ||
      ![
        'confirmed',
        'order_placed',
        'printing',
        'in_production',
        'reprint_required',
        'quality_check',
        'packing',
        'delayed',
      ].includes(order.status)
    )
      throw new CommerceError('This item is not waiting to print.');
    itemSet = "production_status='printing',qc_passed_at=NULL,packed_at=NULL";
    status = 'printing';
  } else if (data.action === 'print_complete') {
    if (item!.production_status !== 'printing')
      throw new CommerceError('Start printing this item first.');
    itemSet = "production_status='quality_check'";
    if (
      items.every(
        (i) =>
          i.id === item!.id ||
          ['quality_check', 'qc_passed', 'packed'].includes(
            i.production_status,
          ),
      )
    )
      status = 'quality_check';
  } else if (data.action === 'qc_pass') {
    if (item!.production_status !== 'quality_check')
      throw new CommerceError('Complete printing before quality control.');
    assertQC(data.checklist || {});
    itemSet = "production_status='qc_passed',qc_checklist=?,qc_passed_at=?";
    itemValues = [JSON.stringify(data.checklist), now];
    if (
      items.every(
        (i) =>
          i.id === item!.id ||
          ['qc_passed', 'packed'].includes(i.production_status),
      )
    )
      status = 'packing';
  } else if (data.action === 'qc_fail') {
    if (!['quality_check', 'qc_passed'].includes(item!.production_status))
      throw new CommerceError('This item is not in quality control.');
    if (!data.note) throw new CommerceError('Record why a reprint is needed.');
    itemSet =
      "production_status='reprint_required',qc_passed_at=NULL,packed_at=NULL,reprint_count=reprint_count+1";
    status = 'reprint_required';
    const reprintPlan = await planOrder(db, [item!]);
    allocations = reprintPlan.allocations;
    extra.estimated_delivery_date = reprintPlan.estimatedDeliveryDate;
  } else if (data.action === 'pack') {
    if (!item!.qc_passed_at || item!.production_status !== 'qc_passed')
      throw new CommerceError(
        'The full line quantity must pass QC before packing.',
      );
    itemSet = "production_status='packed',packed_at=?";
    itemValues = [now];
  } else if (data.action === 'ready') {
    if (!['packing', 'packed', 'quality_check'].includes(order.status))
      throw new CommerceError('Complete quality control and packing first.');
    assertCompletePacking(items);
    status = 'ready';
  } else if (data.action === 'cancel') {
    if (!data.note) throw new CommerceError('Enter a cancellation reason.');
    status = 'cancelled';
  } else if (data.action === 'reschedule') {
    if (!['delivery_failed', 'reschedule_required'].includes(order.status))
      throw new CommerceError('Only a failed delivery can be rescheduled.');
    status = 'ready';
  } else if (data.action === 'estimate') {
    if (data.printMinutes && item) {
      itemSet = 'estimated_print_minutes=?';
      itemValues = [data.printMinutes];
    } else {
      if (!data.date || data.date < localDate() || !data.note)
        throw new CommerceError(
          'Choose today or a later date and record the reason.',
        );
      extra.promised_delivery_date = data.date;
    }
  }
  const cancellationEvent =
    status === 'cancelled'
      ? await prepareCommerceEvent(db, order, 'order_cancelled')
      : () => [];
  await mutateOrder(
    db,
    order,
    {
      status,
      note: data.note || data.action.replaceAll('_', ' '),
      actor: 'admin',
      extra,
    },
    (token) => {
      const statements: D1PreparedStatement[] = [];
      statements.push(...cancellationEvent(token));
      if (status === 'cancelled')
        statements.push(
          db
            .prepare(
              "DELETE FROM production_allocations WHERE production_date>=? AND order_item_id IN (SELECT id FROM order_items WHERE order_id=? AND production_status='queued') AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)",
            )
            .bind(localDate(), order.id, order.id, token),
        );
      if (itemSet && item)
        statements.push(
          db
            .prepare(
              `UPDATE order_items SET ${itemSet},updated_at=? WHERE id=? AND order_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)`,
            )
            .bind(...itemValues, now, item.id, order.id, order.id, token),
        );
      for (const a of allocations)
        statements.push(
          db
            .prepare(
              'INSERT INTO production_allocations (id,order_item_id,production_date,minutes) SELECT ?,?,?,? FROM orders WHERE id=? AND last_operation_id=?',
            )
            .bind(
              crypto.randomUUID(),
              a.itemId,
              a.date,
              a.minutes,
              order.id,
              token,
            ),
        );
      return statements;
    },
  );
  return { ok: true };
}

export async function confirmUPI(db: D1Database, id: string) {
  const order = await readOperationOrder(db, id);
  if (order.payment_status === 'paid') return { ok: true, duplicate: true };
  if (
    order.payment_method !== 'UPI' ||
    !['payment_pending', 'awaiting_confirmation', 'confirmed'].includes(
      order.status,
    )
  )
    throw new CommerceError(
      'Only a pending UPI order can be marked paid here.',
    );
  const items = (
    await db
      .prepare('SELECT * FROM order_items WHERE order_id=?')
      .bind(order.id)
      .all<Item>()
  ).results;
  const plan = await planOrder(db, items),
    now = new Date().toISOString();
  const purchaseEvent = await prepareCommerceEvent(db, order, 'Purchase');
  await mutateOrder(
    db,
    order,
    {
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'UPI',
      note: 'UPI receipt verified manually by owner.',
      actor: 'admin',
      extra: { estimated_delivery_date: plan.estimatedDeliveryDate },
    },
    (token) => [
      ...purchaseEvent(token),
      db
        .prepare(
          "INSERT INTO payment_collections (id,order_id,method,amount_due,amount_collected,settlement_status,settled_at,collected_at) SELECT ?,id,'UPI',total,total,'settled',?,? FROM orders WHERE id=? AND last_operation_id=?",
        )
        .bind(crypto.randomUUID(), now, now, order.id, token),
      ...plan.allocations.map((a) =>
        db
          .prepare(
            'INSERT INTO production_allocations (id,order_item_id,production_date,minutes) SELECT ?,?,?,? FROM orders WHERE id=? AND last_operation_id=?',
          )
          .bind(
            crypto.randomUUID(),
            a.itemId,
            a.date,
            a.minutes,
            order.id,
            token,
          ),
      ),
    ],
  );
  return { ok: true };
}
