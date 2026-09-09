// Presentation only. These labels never authorize or perform an order transition.
export const FLOW_STAGES = [
  'Confirmed',
  'Printing',
  'Quality check',
  'Packing',
  'Ready',
  'Delivery',
  'Delivered',
];
const states: Record<string, [string, number, string, string, string]> = {
  confirmed: [
    'Confirmed',
    0,
    'Printing',
    'Choose the next item to print',
    'waiting',
  ],
  order_placed: [
    'Order placed',
    -1,
    'Confirmation',
    'Review this order',
    'waiting',
  ],
  printing: [
    'Printing',
    1,
    'Quality check',
    'Finish printing, then inspect the items',
    'working',
  ],
  in_production: [
    'Printing',
    1,
    'Quality check',
    'Finish printing, then inspect the items',
    'working',
  ],
  quality_check: [
    'Quality check',
    2,
    'Packing',
    'Inspect every item before packing',
    'working',
  ],
  packing: [
    'Packing',
    3,
    'Ready for delivery',
    'Check that every item is packed',
    'working',
  ],
  packed: [
    'Packed',
    3,
    'Ready for delivery',
    'Mark the complete package ready',
    'success',
  ],
  ready: [
    'Ready for delivery',
    4,
    'Assign a delivery run',
    'Choose a delivery person and date',
    'success',
  ],
  scheduled: [
    'Delivery scheduled',
    5,
    'Out for delivery',
    'The assigned delivery run is next',
    'waiting',
  ],
  out_for_delivery: [
    'Out for delivery',
    5,
    'Delivered',
    'Complete the handover and payment check',
    'working',
  ],
  delivered: [
    'Delivered',
    6,
    'Review & reorder',
    'Delivery is complete',
    'success',
  ],
  reprint_required: [
    'Reprint needed',
    1,
    'Printing',
    'Reprint the affected item and review the delivery date',
    'danger',
  ],
  delivery_failed: [
    'Delivery needs attention',
    5,
    'Reschedule',
    'Review the failed visit before rescheduling',
    'danger',
  ],
  reschedule_required: [
    'Ready to reschedule',
    5,
    'Assign another delivery run',
    'Choose a new delivery date',
    'warning',
  ],
  delayed: [
    'Delivery date needs review',
    -1,
    'Updated delivery estimate',
    'Review the schedule and update the customer',
    'warning',
  ],
  payment_pending: [
    'UPI payment pending',
    -1,
    'Payment confirmation',
    'Confirm UPI receipt before production',
    'warning',
  ],
  payment_failed: [
    'Payment needs attention',
    -1,
    'Payment confirmation',
    'Contact the customer to resolve payment',
    'danger',
  ],
  awaiting_confirmation: [
    'Confirmation needed',
    -1,
    'Confirmation',
    'Review payment and order details',
    'warning',
  ],
  checkout_started: [
    'Checkout started',
    -1,
    'Order placement',
    'The customer has not placed this order yet',
    'neutral',
  ],
  draft: ['Draft', -1, 'Order placement', 'Not yet an active order', 'neutral'],
  cancelled: [
    'Cancelled',
    -1,
    'No production action',
    'Review any payment separately',
    'neutral',
  ],
};
export function orderPresentation(status: string) {
  const [label, index, next, instruction, tone] = states[status] || [
    'Status under review',
    -1,
    'Owner review',
    'Check the latest order update',
    'neutral',
  ];
  const href = [
    'payment_pending',
    'payment_failed',
    'awaiting_confirmation',
  ].includes(status)
    ? '/admin/orders?status=' + status
    : [
          'ready',
          'scheduled',
          'out_for_delivery',
          'delivered',
          'delivery_failed',
          'reschedule_required',
        ].includes(status)
      ? '/admin/delivery'
      : '/admin/production';
  return { label, index, next, instruction, tone, href };
}
export function paymentLabel(status: string) {
  return (
    (
      {
        paid: 'Paid',
        cod: 'Pay on delivery',
        unpaid: 'Not paid',
        awaiting_payment: 'Awaiting UPI',
        refunded: 'Refunded',
        partially_refunded: 'Partly refunded',
      } as Record<string, string>
    )[status] || 'Payment under review'
  );
}
export function durationLabel(minutes?: number | null) {
  if (!minutes || minutes <= 0) return 'Print time needed';
  const whole = Math.ceil(minutes),
    hours = Math.floor(whole / 60),
    remainder = whole % 60;
  return hours
    ? `${hours} hr${remainder ? ` ${remainder} min` : ''}`
    : `${whole} min`;
}
export function dateLabel(value?: string | null) {
  if (!value) return 'Date being reviewed';
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  return Number.isNaN(date.getTime())
    ? 'Date being reviewed'
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(date);
}
export function isOverdue(
  date?: string | null,
  status?: string,
  today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()),
) {
  return Boolean(
    date && date < today && !['delivered', 'cancelled'].includes(status || ''),
  );
}
export function productReadiness(product: Record<string, any>) {
  const missing: string[] = [];
  if (!(product.main_image || product.images?.length || product.image_count))
    missing.push('Main image');
  if (product.commercial_license_status !== 'commercial_verified')
    missing.push('Licence check');
  if (
    product.product_type !== 'customizable' &&
    product.stock_mode !== 'quote_only' &&
    !(product.base_price > 0)
  )
    missing.push('Selling price');
  if (!product.short_description?.trim()) missing.push('Short description');
  return missing;
}
