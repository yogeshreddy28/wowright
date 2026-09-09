import type { OrderStatus } from '../domain';

export const orderStatusLabels: Record<OrderStatus, string> = {
  draft: 'Draft',
  checkout_started: 'Checkout started',
  awaiting_confirmation: 'Awaiting confirmation',
  payment_pending: 'Payment Pending',
  payment_failed: 'Payment Failed',
  order_placed: 'Order Placed',
  confirmed: 'Confirmed',
  printing: 'Printing',
  in_production: 'Printing',
  quality_check: 'Quality Check',
  packing: 'Packing', scheduled: 'Scheduled for Delivery', reprint_required: 'Reprint Required', delayed: 'Delayed', delivery_failed: 'Delivery Failed', reschedule_required: 'Reschedule Required',
  packed: 'Packed',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const transitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ['checkout_started', 'cancelled'],
  checkout_started: [
    'awaiting_confirmation',
    'payment_pending',
    'order_placed',
    'confirmed',
    'cancelled',
  ],
  awaiting_confirmation: ['payment_pending', 'confirmed', 'cancelled'],
  payment_pending: ['confirmed', 'payment_failed', 'cancelled'],
  payment_failed: ['payment_pending', 'cancelled'],
  order_placed: ['confirmed', 'printing', 'cancelled'],
  confirmed: ['printing', 'in_production', 'cancelled'],
  printing: ['quality_check', 'cancelled'],
  in_production: ['quality_check', 'cancelled'],
  quality_check: ['packing', 'reprint_required', 'cancelled'],
  packing: ['ready', 'reprint_required', 'cancelled'],
  reprint_required: ['printing', 'cancelled'],
  delayed: ['printing', 'cancelled'],
  packed: ['ready', 'scheduled', 'cancelled'],
  ready: ['scheduled', 'cancelled'],
  scheduled: ['out_for_delivery', 'ready', 'cancelled'],
  out_for_delivery: ['delivered', 'delivery_failed'],
  delivery_failed: ['reschedule_required', 'cancelled'],
  reschedule_required: ['ready', 'scheduled', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from]?.includes(to))
    throw new Error(`Cannot move order from ${from} to ${to}`);
}

export function formatOrderNumber(dateKey: string, sequence: number) {
  return `WR-${dateKey}-${String(sequence).padStart(4, '0')}`;
}

export function businessDateKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replaceAll('-', '');
}

export function getCheckoutOutcome(paymentMethod: 'COD' | 'UPI') {
  return paymentMethod === 'COD'
    ? {
        orderStatus: 'confirmed' as const,
        paymentStatus: 'cod' as const,
        requiresWhatsApp: false,
      }
    : {
        orderStatus: 'payment_pending' as const,
        paymentStatus: 'awaiting_payment' as const,
        requiresWhatsApp: true,
      };
}

export async function createOrderNumber(db: D1Database, now = new Date()) {
  const dateKey = businessDateKey(now);
  const row = await db
    .prepare(
      'INSERT INTO order_sequences (date_key,value) VALUES (?,1) ON CONFLICT(date_key) DO UPDATE SET value=value+1 RETURNING value',
    )
    .bind(dateKey)
    .first<{ value: number }>();
  if (!row) throw new Error('Could not allocate order number');
  return formatOrderNumber(dateKey, row.value);
}
