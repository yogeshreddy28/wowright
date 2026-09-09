import { z } from 'zod';
import { CommerceError } from './launch-rules';
import { mutateOrder, readOperationOrder } from './order-mutation';
import { assertCompletePacking, localDate } from './production';
import { prepareCommerceEvent } from './tracking';
import { activeDeliveryOtp } from './delivery-otp';

export function suggestRoute<T extends { latitude: number; longitude: number }>(
  stops: T[],
) {
  if (!stops.length) return [];
  const pending = [...stops],
    result = [pending.shift()!];
  while (pending.length) {
    const last = result[result.length - 1];
    pending.sort(
      (a, b) =>
        Math.hypot(
          a.latitude - last.latitude,
          (a.longitude - last.longitude) * 0.975,
        ) -
        Math.hypot(
          b.latitude - last.latitude,
          (b.longitude - last.longitude) * 0.975,
        ),
    );
    result.push(pending.shift()!);
  }
  return result;
}
export const batchInput = z.object({
  personId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindow: z.string().trim().min(3).max(100),
  orderIds: z.array(z.string().min(1)).min(1).max(30),
});
export async function assignBatch(db: D1Database, raw: unknown) {
  const data = batchInput.parse(raw);
  if (new Set(data.orderIds).size !== data.orderIds.length)
    throw new CommerceError('Select each order only once.');
  if (data.date < localDate())
    throw new CommerceError('Choose today or a later delivery date.');
  if (
    !(await db
      .prepare('SELECT id FROM delivery_people WHERE id=? AND active=1')
      .bind(data.personId)
      .first())
  )
    throw new CommerceError('Choose an active delivery person.');
  const orders = await Promise.all(
    data.orderIds.map((id) => readOperationOrder(db, id)),
  );
  for (const order of orders) {
    if (!['ready', 'packed', 'reschedule_required'].includes(order.status))
      throw new CommerceError(
        'Only completely packed ready orders can be assigned.',
      );
    assertCompletePacking(
      (
        await db
          .prepare(
            'SELECT qc_passed_at,packed_at FROM order_items WHERE order_id=?',
          )
          .bind(order.id)
          .all<{ qc_passed_at: string | null; packed_at: string | null }>()
      ).results,
    );
    if (order.latitude == null || order.longitude == null)
      throw new CommerceError(
        'This order needs a delivery location before assignment.',
      );
  }
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  // Trigger on delivery_stops rechecks readiness within the atomic D1 batch.
  const statements = [
    db
      .prepare(
        'INSERT INTO delivery_batches (id,person_id,delivery_date,time_window,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(id, data.personId, data.date, data.timeWindow, now, now),
  ];
  orders.forEach((order, index) =>
    statements.push(
      db
        .prepare(
          'INSERT INTO delivery_stops (id,batch_id,order_id,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(crypto.randomUUID(), id, order.id, index, now, now),
      db
        .prepare(
          "UPDATE orders SET status='scheduled',delivery_window=?,promised_delivery_date=?,revision=revision+1,updated_at=? WHERE id=?",
        )
        .bind(data.timeWindow, data.date, now, order.id),
      db
        .prepare(
          "INSERT INTO order_timeline (id,order_id,from_status,to_status,note,actor,created_at) VALUES (?,?,?,'scheduled','Scheduled for delivery. Keep your phone reachable.','admin',?)",
        )
        .bind(crypto.randomUUID(), order.id, order.status, now),
    ),
  );
  await db.batch(statements);
  return { id };
}
const stopAction = z.object({
  stopId: z.string(),
  action: z.enum(['start', 'arrive', 'later', 'fail', 'prepare_otp', 'complete']),
  note: z.string().trim().max(500).optional(),
  method: z.enum(['cash', 'UPI']).optional(),
  amount: z.number().int().min(0).optional(),
  accepted: z.boolean().optional(),
  proofId: z.string().optional(),
});
export async function updateStop(
  db: D1Database,
  personId: string,
  raw: unknown,
) {
  const data = stopAction.parse(raw);
  const stop = await db
    .prepare(
      'SELECT s.*,b.delivery_date FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id WHERE s.id=? AND b.person_id=?',
    )
    .bind(data.stopId, personId)
    .first<{
      id: string;
      order_id: string;
      batch_id: string;
      status: string;
      delivery_date: string;
      open_box_accepted_at: string | null;
      proof_id: string | null;
    }>();
  if (!stop) throw new CommerceError('Assigned delivery not found.', 404);
  if (['delivered', 'failed'].includes(stop.status))
    throw new CommerceError('This stop is already complete.');
  const order = await readOperationOrder(db, stop.order_id),
    now = new Date().toISOString();
  let status = order.status,
    stopStatus = stop.status,
    payment = order.payment_status;
  if (data.action === 'start') {
    if (order.status !== 'scheduled' || stop.delivery_date !== localDate())
      throw new CommerceError(
        'Only today’s scheduled orders can go out for delivery.',
      );
    status = 'out_for_delivery';
    stopStatus = 'out_for_delivery';
  } else {
    if (order.status !== 'out_for_delivery')
      throw new CommerceError('Start this delivery run first.');
    if (data.action === 'arrive') stopStatus = 'arrived';
    if (data.action === 'later') {
      if (!data.note)
        throw new CommerceError('Add a note for the later visit.');
      stopStatus = 'later_today';
    }
    if (data.action === 'fail') {
      if (!data.note)
        throw new CommerceError('Choose or describe the failure reason.');
      status = 'delivery_failed';
      stopStatus = 'failed';
    }
    if (data.action === 'prepare_otp') {
      if (!data.accepted)
        throw new CommerceError(
          'Record open-box inspection and customer acceptance.',
        );
      if (
        !data.proofId ||
        !(await db
          .prepare(
            'SELECT id FROM delivery_proofs WHERE id=? AND order_id=? AND person_id=?',
          )
          .bind(data.proofId, order.id, personId)
          .first())
      )
        throw new CommerceError(
          'Upload the consented proof of delivery first.',
        );
      if (order.payment_status === 'cod') {
        if (!data.method || data.amount !== order.total)
          throw new CommerceError(
            'Record the exact outstanding COD amount and collection method.',
          );
        payment = 'paid';
      } else if (order.payment_status !== 'paid')
        throw new CommerceError(
          'Payment must be confirmed before delivery completion.',
        );
      stopStatus = 'otp_pending';
    }
    if (data.action === 'complete') {
      const otp = await activeDeliveryOtp(db, stop.id);
      if (!otp?.verified_at || otp.consumed_at || otp.invalidated_at)
        throw new CommerceError('Verify the customer delivery code before completion.', 409);
      if (!stop.open_box_accepted_at || !stop.proof_id)
        throw new CommerceError('Complete the open-box handover and proof first.', 409);
      if (order.payment_status !== 'paid') throw new CommerceError('Payment must be confirmed before delivery completion.', 409);
      status = 'delivered'; stopStatus = 'delivered';
    }
  }
  const deliveredEvent =
    status === 'delivered'
      ? await prepareCommerceEvent(db, order, 'order_delivered')
      : () => [];
  const purchaseEvent =
    status === 'delivered'
      ? await prepareCommerceEvent(db, order, 'Purchase')
      : () => [];
  await mutateOrder(
    db,
    order,
    {
      status,
      paymentStatus: payment,
      note:
        data.action === 'later'
          ? 'Delivery will be attempted later today.'
          : data.action === 'fail'
            ? 'Delivery could not be completed. Support will arrange the next step.'
            : data.action === 'prepare_otp'
              ? 'Open-box handover and payment recorded. Customer verification is pending.'
            : data.action === 'complete'
              ? 'Open-box delivery accepted.'
              : data.action === 'start'
                ? 'Your order is Out for Delivery.'
                : 'Delivery person arrived.',
      actor: `delivery:${personId}`,
      extra: status === 'delivered' ? { delivered_at: now } : {},
    },
    (token) => {
      const statements = [
        ...deliveredEvent(token),
        ...purchaseEvent(token),
        db
          .prepare(
            'UPDATE delivery_stops SET status=?,availability_note=COALESCE(?,availability_note),failure_reason=COALESCE(?,failure_reason),arrived_at=COALESCE(?,arrived_at),completed_at=COALESCE(?,completed_at),open_box_accepted_at=COALESCE(?,open_box_accepted_at),payment_recorded_at=COALESCE(?,payment_recorded_at),proof_id=COALESCE(?,proof_id),updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)',
          )
          .bind(
            stopStatus,
            data.action === 'later' ? data.note! : null,
            data.action === 'fail' ? data.note! : null,
            data.action === 'arrive' ? now : null,
            ['delivered', 'failed'].includes(stopStatus) ? now : null,
            data.action === 'prepare_otp' ? now : null,
            data.action === 'prepare_otp' ? now : null,
            data.action === 'prepare_otp' ? data.proofId! : null,
            now,
            stop.id,
            order.id,
            token,
          ),
      ];
      if (data.action === 'start')
        statements.push(
          db
            .prepare(
              "UPDATE delivery_batches SET status='active',started_at=COALESCE(started_at,?),updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)",
            )
            .bind(now, now, stop.batch_id, order.id, token),
        );
      if (data.action === 'prepare_otp' && order.payment_status === 'cod')
        statements.push(
          db
            .prepare(
              'INSERT INTO payment_collections (id,order_id,person_id,method,amount_due,amount_collected,collected_at) SELECT ?,id,?,?,total,?,? FROM orders WHERE id=? AND last_operation_id=?',
            )
            .bind(
              crypto.randomUUID(),
              personId,
              data.method!,
              data.amount!,
              now,
              order.id,
              token,
            ),
        );
      if (['delivered', 'failed'].includes(stopStatus))
        statements.push(
          db
            .prepare(
              "UPDATE delivery_batches SET status='completed',updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM delivery_stops WHERE batch_id=? AND status NOT IN ('delivered','failed')) AND EXISTS(SELECT 1 FROM orders WHERE id=? AND last_operation_id=?)",
            )
            .bind(now, stop.batch_id, stop.batch_id, order.id, token),
        );
      if (data.action === 'complete') statements.push(db.prepare('UPDATE delivery_otps SET consumed_at=?,updated_at=? WHERE stop_id=? AND verified_at IS NOT NULL AND consumed_at IS NULL AND invalidated_at IS NULL').bind(now, now, stop.id));
      return statements;
    },
  );
  return { ok: true };
}
