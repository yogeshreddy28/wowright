import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Package,
  CalendarDays,
} from 'lucide-react';
import {
  FLOW_STAGES,
  orderPresentation,
  dateLabel,
  isOverdue,
} from '@/lib/workflow-presentation';
import { LAUNCH_COMMERCE, launchTotals } from '@/lib/services/launch-rules';
import { formatMoney } from '@/lib/services/pricing';

export function StatusChip({ status }: { status: string }) {
  const state = orderPresentation(status);
  return (
    <span className={`ux-chip ${state.tone}`}>
      <i />
      {state.label}
    </span>
  );
}
export function OrderFlow({
  status,
  compact = false,
  customer = false,
}: {
  status: string;
  compact?: boolean;
  customer?: boolean;
}) {
  const state = orderPresentation(status);
  return (
    <div className={`ux-order-flow ${compact ? 'compact' : ''}`}>
      {state.index < 0 ? (
        <p className={`ux-flow-notice ${state.tone}`}>
          {state.label} ·{' '}
          {customer
            ? status === 'cancelled'
              ? 'Contact support if you need help with a payment.'
              : status === 'payment_pending' || status === 'payment_failed'
                ? 'Your order is saved. Payment must be confirmed before printing.'
                : 'We’ll update this page when the next step is confirmed.'
            : state.instruction}
        </p>
      ) : (
        <>
          <ol aria-label={`Order progress: ${state.label}`}>
            {FLOW_STAGES.map((label, index) => (
              <li
                key={label}
                className={
                  index < state.index
                    ? 'done'
                    : index === state.index
                      ? 'current'
                      : ''
                }
                aria-current={index === state.index ? 'step' : undefined}
              >
                <span>
                  {index < state.index ? <Check size={12} /> : index + 1}
                </span>
                <b>{label}</b>
              </li>
            ))}
          </ol>
          {!compact && (
            <p>
              <strong>Now: {state.label}</strong>
              <span>
                {state.index === 6
                  ? 'Thank you for choosing WOW RIGHT.'
                  : `Next: ${state.next}`}
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
export function DeliveryDate({
  date,
  status,
}: {
  date?: string | null;
  status?: string;
}) {
  const late = isOverdue(date, status);
  return (
    <span className={`ux-date ${late ? 'late' : ''}`}>
      <CalendarDays size={15} />
      {date
        ? `${late ? 'Date needs updating · ' : 'Delivery by '}${dateLabel(date)}`
        : 'Delivery date under review'}
    </span>
  );
}
export function EmptyWork({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="ux-empty">
      <CheckCircle2 />
      <div>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {href && (
          <Link href={href}>
            {action || 'Continue'} <ArrowRight size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}
export function WorkflowThumb({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  return src ? (
    <img className="ux-thumb" src={src} alt={name} loading="lazy" />
  ) : (
    <span className="ux-thumb empty" aria-label={`${name}: no image`}>
      <Package />
    </span>
  );
}
export function ShoppingSteps({
  current,
}: {
  current: 'cart' | 'account' | 'checkout' | 'saved';
}) {
  const steps = [
    ['cart', 'Cart', '/cart'],
    ['account', 'Account', '/account?returnTo=checkout'],
    ['checkout', 'Checkout', '/checkout'],
    ['saved', 'Order saved', ''],
  ];
  const selected = steps.findIndex(([id]) => id === current);
  return (
    <nav className="ux-shopping-steps" aria-label="Checkout progress">
      {steps.map(([id, label, href], index) => (
        <span
          key={id}
          className={
            index === selected ? 'current' : index < selected ? 'done' : ''
          }
          aria-current={index === selected ? 'step' : undefined}
        >
          {index < selected ? <Check size={14} /> : <Circle size={12} />}{' '}
          {index < selected && href ? <Link href={href}>{label}</Link> : label}
        </span>
      ))}
    </nav>
  );
}

export function CartIncentive({ subtotal }: { subtotal: number }) {
  const totals = launchTotals(subtotal);
  const target = totals.missing
    ? LAUNCH_COMMERCE.minimumOrder
    : LAUNCH_COMMERCE.freeDeliveryThreshold;
  return (
    <section className="ux-cart-incentive" aria-label="Delivery savings">
      <strong>
        {totals.missing
          ? `${formatMoney(totals.missing)} more to place your order`
          : totals.freeDeliveryRemaining
            ? `${formatMoney(totals.freeDeliveryRemaining)} more for FREE delivery`
            : 'You’ve unlocked FREE delivery'}
      </strong>
      <progress value={Math.min(subtotal, target)} max={target} />
      <small>
        {totals.missing
          ? `Minimum order ${formatMoney(LAUNCH_COMMERCE.minimumOrder)} · delivery is free from ${formatMoney(LAUNCH_COMMERCE.freeDeliveryThreshold)}`
          : totals.freeDeliveryRemaining
            ? `Free delivery on product orders of ${formatMoney(LAUNCH_COMMERCE.freeDeliveryThreshold)} or more`
            : `You save ${formatMoney(LAUNCH_COMMERCE.deliveryCharge)} on delivery`}
      </small>
    </section>
  );
}
