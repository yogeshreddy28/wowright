import { CommerceError, LAUNCH_COMMERCE } from './launch-rules';

export function localDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export type WorkItem = {
  id: string;
  quantity: number;
  estimated_print_minutes: number | null;
};
export function allocateProduction(
  items: WorkItem[],
  occupied: Record<string, number>,
  today = localDate(),
  capacity = LAUNCH_COMMERCE.dailyPrintMinutes,
) {
  const allocations: { itemId: string; date: string; minutes: number }[] = [];
  const remaining = { ...occupied };
  let finalDate = addDays(today, 1);
  const unknown = items
    .filter((i) => !i.estimated_print_minutes || i.estimated_print_minutes <= 0)
    .map((i) => i.id);
  for (const item of items) {
    if (!item.estimated_print_minutes) continue;
    let minutes = item.estimated_print_minutes * item.quantity,
      date = today,
      days = 0;
    while (minutes > 0) {
      if (++days > 730)
        throw new CommerceError(
          'Production requires an owner-reviewed schedule.',
        );
      const free = Math.max(0, capacity - (remaining[date] || 0));
      const assigned = Math.min(minutes, free);
      if (assigned) {
        allocations.push({ itemId: item.id, date, minutes: assigned });
        remaining[date] = (remaining[date] || 0) + assigned;
        minutes -= assigned;
        // At least next day; no time slot is promised while production is incomplete.
        finalDate = finalDate > addDays(date, 1) ? finalDate : addDays(date, 1);
      }
      date = addDays(date, 1);
    }
  }
  return {
    allocations,
    unknown,
    estimatedDeliveryDate: unknown.length ? null : finalDate,
  };
}
export async function planOrder(db: D1Database, items: WorkItem[]) {
  const occupied = await db
    .prepare(
      'SELECT production_date date,SUM(minutes) minutes FROM production_allocations WHERE production_date>=? GROUP BY production_date',
    )
    .bind(localDate())
    .all<{ date: string; minutes: number }>();
  const plan = allocateProduction(
    items,
    Object.fromEntries(occupied.results.map((row) => [row.date, row.minutes])),
  );
  const unplanned = await db
    .prepare(
      "SELECT COUNT(*) count FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.payment_status IN ('paid','cod') AND o.status NOT IN ('cancelled','delivered') AND i.production_status IN ('queued','reprint_required','printing') AND (i.estimated_print_minutes IS NULL OR i.estimated_print_minutes<=0)",
    )
    .first<{ count: number }>();
  // Unknown work ahead of this order must not turn into a precise delivery promise.
  return {
    ...plan,
    estimatedDeliveryDate: unplanned?.count ? null : plan.estimatedDeliveryDate,
  };
}
export const QC_FIELDS = [
  'correctProduct',
  'correctFinish',
  'correctQuantity',
  'noDamage',
  'acceptableAppearance',
] as const;
export function assertQC(checklist: Record<string, boolean>) {
  if (!QC_FIELDS.every((key) => checklist[key] === true))
    throw new CommerceError(
      'All five quality checks must pass before packing.',
    );
}
export function assertCompletePacking(
  items: { qc_passed_at: string | null; packed_at: string | null }[],
) {
  if (!items.length || items.some((i) => !i.qc_passed_at || !i.packed_at))
    throw new CommerceError(
      'Every line item must pass QC and be verified as packed.',
    );
}
