'use client';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCheck,
  ClipboardCheck,
  Factory,
  PackageCheck,
  Truck,
  Wallet,
  TrendingUp,
  MessageSquare,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { durationLabel } from '@/lib/workflow-presentation';
type Row = Record<string, any>;
function Metric({
  icon: Icon,
  label,
  value,
  hint,
  href,
  alert = false,
}: {
  icon: typeof Truck;
  label: string;
  value: string | number;
  hint: string;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className={`ux-metric ${alert ? 'attention' : ''}`}>
      <Icon />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
      <ArrowRight className="metric-arrow" />
    </Link>
  );
}
export function AdminOverview({ data }: { data: Row }) {
  const o = data.orders || {},
    w = data.work || {},
    t = data.today || {},
    c = data.companion || {},
    p = data.profitToday || {};
  const next =
    o.awaiting > 0
      ? {
          title: 'Confirm pending payments',
          body: `${o.awaiting} order${o.awaiting === 1 ? '' : 's'} need a payment or confirmation check before production.`,
          cta: 'Review confirmations',
          href: '/admin/orders?status=needs_confirmation',
        }
      : w.qc_items > 0
        ? {
            title: 'Inspect the finished prints',
            body: `${w.qc_items} item${w.qc_items === 1 ? ' is' : 's are'} waiting for the five-point quality check.`,
            cta: 'Start quality checks',
            href: '/admin/production?stage=qc',
          }
        : w.packing_items > 0
          ? {
              title: 'Pack the checked items',
              body: 'Verify every item in the order before marking the package ready.',
              cta: 'Open packing',
              href: '/admin/production?stage=packing',
            }
          : w.waiting_items > 0
            ? {
                title: data.nextItem?.estimated_print_minutes
                  ? 'Choose the next print'
                  : 'Add the missing print time',
                body: data.nextItem
                  ? `${data.nextItem.product_name} · ${data.nextItem.order_number}`
                  : 'Review the waiting queue and delivery dates.',
                cta: 'Open print queue',
                href: '/admin/production?stage=waiting',
              }
            : o.ready > 0
              ? {
                  title: 'Prepare the next delivery run',
                  body: 'Group ready packages, then choose the delivery person and date.',
                  cta: 'Assign deliveries',
                  href: '/admin/delivery',
                }
              : data.quotes?.count > 0
                ? {
                    title: 'Review custom requests',
                    body: 'Agree the details, price and delivery estimate with your customer.',
                    cta: 'Review requests',
                    href: '/admin/quotes',
                  }
                : {
                    title: 'You’re up to date',
                    body: 'No immediate fulfillment task. Review your draft products when you’re ready.',
                    cta: 'Review catalogue',
                    href: '/admin/products',
                  };
  return (
    <div className="ux-command">
      <header className="admin-head">
        <div>
          <p className="eyebrow">Your working day</p>
          <h1>Today at WOW RIGHT</h1>
        </div>
        <span className="ux-today">
          {new Intl.DateTimeFormat('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            timeZone: 'Asia/Kolkata',
          }).format(new Date())}
        </span>
      </header>
      <section className="ux-next-action">
        <span className="ux-next-icon">
          <ArrowRight />
        </span>
        <div>
          <small>DO THIS NEXT</small>
          <h2>{next.title}</h2>
          <p>{next.body}</p>
        </div>
        <Link className="button primary" href={next.href}>
          {next.cta}
          <ArrowRight size={17} />
        </Link>
      </section>
      <section className="ux-attention-strip" aria-label="Needs attention">
        <strong>
          <AlertCircle size={17} />
          Needs attention
        </strong>
        <Link href="/admin/orders?status=needs_confirmation">
          {o.awaiting || 0} confirmations
        </Link>
        <Link
          className={t.delayed ? 'danger' : ''}
          href="/admin/orders?status=at_risk"
        >
          {t.delayed || 0} late / at risk
        </Link>
        <Link href="/admin/production?stage=waiting">
          {w.missing_print_times
            ? `${w.missing_print_times} print times needed`
            : 'Print-time checks clear'}
        </Link>
      </section>
      <div className="ux-command-groups">
        <section className="ux-panel">
          <header>
            <h2>
              <Factory />
              Production
            </h2>
            <span>
              {w.known_waiting_minutes
                ? `${durationLabel(w.known_waiting_minutes)} waiting`
                : 'No known print workload'}
            </span>
          </header>
          <div className="ux-metric-grid">
            <Metric
              icon={Boxes}
              label="Needs printing"
              value={w.waiting_items || 0}
              hint={
                w.waiting_items
                  ? 'Choose the next print'
                  : 'Nothing waiting to print'
              }
              href="/admin/production?stage=waiting"
            />
            <Metric
              icon={Factory}
              label="Printing now"
              value={w.printing_items || 0}
              hint={
                w.printing_items
                  ? 'Check print progress'
                  : 'No prints in progress'
              }
              href="/admin/production?stage=printing"
            />
            <Metric
              icon={ClipboardCheck}
              label="Quality check"
              value={w.qc_items || 0}
              hint={w.qc_items ? 'Inspect before packing' : 'No orders need QC'}
              href="/admin/production?stage=qc"
            />
            <Metric
              icon={PackageCheck}
              label="Packing"
              value={w.packing_items || 0}
              hint={
                w.packing_items ? 'Check every item' : 'Nothing waiting to pack'
              }
              href="/admin/production?stage=packing"
            />
          </div>
        </section>
        <section className="ux-panel">
          <header>
            <h2>
              <Truck />
              Delivery
            </h2>
            <Link href="/admin/delivery">
              Manage runs <ArrowRight size={14} />
            </Link>
          </header>
          <div className="ux-metric-grid">
            <Metric
              icon={CheckCheck}
              label="Ready to go"
              value={o.ready || 0}
              hint={
                o.ready ? 'Assign complete packages' : 'No packages waiting'
              }
              href="/admin/delivery"
            />
            <Metric
              icon={Truck}
              label="Today’s runs"
              value={t.batches_today || 0}
              hint={
                t.batches_today
                  ? 'Follow assigned deliveries'
                  : 'No delivery runs today'
              }
              href="/admin/delivery"
            />
          </div>
        </section>
        <section className="ux-panel ux-money">
          <header>
            <h2>
              <Wallet />
              Money today
            </h2>
            <Link href="/admin/reports">
              Details <ArrowRight size={14} />
            </Link>
          </header>
          <div className="ux-metric-grid">
            <Metric
              icon={ShoppingBag}
              label="Delivered sales"
              value={formatMoney(t.delivered_sales_today || 0)}
              hint="Today’s completed deliveries"
              href="/admin/reports"
            />
            <Metric
              icon={Wallet}
              label="COD outstanding"
              value={formatMoney(t.cod_outstanding || 0)}
              hint="Still to collect · all open orders"
              href="/admin/orders?paymentStatus=cod"
            />
            <Metric
              icon={TrendingUp}
              label="Estimated profit"
              value={formatMoney(p.estimatedProfit || 0)}
              hint={
                p.missingCostLines
                  ? 'Some product costs are missing'
                  : 'Based on recorded costs · target ₹2,000/day'
              }
              href="/admin/reports"
            />
          </div>
          <small className="ux-disclaimer">
            Profit is an estimate, not verified net income. Unrecorded costs are
            excluded.
          </small>
        </section>
      </div>
      <section className="ux-business-line">
        <h2>Business performance</h2>
        <span>
          <b>{o.count || 0}</b> orders
        </span>
        <span>
          <b>{o.delivered || 0}</b> delivered
        </span>
        <span>
          <b>{data.customers?.count || 0}</b> customers
        </span>
        <Link href="/admin/quotes">
          <MessageSquare size={16} />
          {data.quotes?.count || 0} custom requests
        </Link>
        <small>All time</small>
      </section>
      <details className="ux-secondary-details">
        <summary>
          <Sparkles size={16} />
          WOW Companion activity <span>Secondary insights</span>
        </summary>
        {c.impressions ? (
          <div className="ux-inline-stats">
            {[
              ['Suggestions', c.impressions],
              ['Opens', c.opens],
              ['Messages', c.messages],
              ['Assisted orders', c.assisted_orders],
            ].map(([name, value]) => (
              <span key={name}>
                <b>{value || 0}</b>
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p>
            Assistant activity will appear when customers use it. Nothing needs
            your attention here.
          </p>
        )}
      </details>
    </div>
  );
}
