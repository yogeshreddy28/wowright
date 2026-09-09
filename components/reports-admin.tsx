'use client';
import { useState } from 'react';
import { EmptyWork } from './workflow-ui';
import { formatMoney } from '@/lib/services/pricing';
type Row = Record<string, any>;
export function ReportsAdmin({
  data,
  reload,
}: {
  data: Row;
  reload: () => Promise<void>;
}) {
  const [period, setPeriod] = useState(data.period || 'today'),
    [report, setReport] = useState<Row | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const d = report || data,
    e = d.economics || {};
  const count = (name: string, field = 'events') =>
    Number(d.funnel?.find((f: Row) => f.name === name)?.[field] || 0);
  const stages = [
    ['Visitors', count('page_view', 'sessions'), 'browser sessions'],
    ['Product views', count('ViewContent') || count('product_view'), 'views'],
    ['Added to cart', count('AddToCart') || count('add_to_cart'), 'events'],
    [
      'Checkout',
      count('InitiateCheckout') || count('checkout_started'),
      'starts',
    ],
    ['Orders', count('order_created'), 'orders created'],
    ['Delivered', e.delivered_orders || 0, 'orders delivered'],
  ];
  async function send(body: Row) {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        result = (await r.json()) as Row;
      if (!r.ok) throw new Error(result.error);
      setMessage(result.status || 'Saved');
      const refreshed = await fetch('/api/admin/reports?period=' + period);
      if (refreshed.ok) setReport((await refreshed.json()) as Row);
      else await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="admin-head">
        <div>
          <h1>Profit & analytics</h1>
          <p>
            Delivered sales, recorded costs and what is left. Test orders are
            excluded.
          </p>
        </div>
        <select
          disabled={busy}
          aria-label="Reporting period"
          value={period}
          onChange={async (e) => {
            const selected = e.target.value;
            setBusy(true);
            setMessage('');
            try {
              const r = await fetch('/api/admin/reports?period=' + selected);
              if (!r.ok) throw new Error();
              setReport((await r.json()) as Row);
              setPeriod(selected);
            } catch {
              setMessage(
                'Could not load this period. The previous report is still shown.',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="today">Today</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </header>
      {message && (
        <p role="status" className="ux-inline-notice">
          {message}
        </p>
      )}
      <div className="ux-money-report">
        {[
          ['Revenue', e.sales],
          [
            'Recorded costs',
            Number(e.product_cost || 0) + Number(e.direct_costs || 0),
          ],
          ['Estimated profit', e.estimatedNetProfit],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{formatMoney(Number(value) || 0)}</strong>
            <small>
              {label === 'Revenue'
                ? 'Delivered orders only'
                : label === 'Recorded costs'
                  ? 'Product + direct costs'
                  : 'Before any unrecorded costs'}
            </small>
          </article>
        ))}
        <article className="ux-profit-target">
          <span>Daily profit target</span>
          <strong>{formatMoney(e.dailyTarget || 2000)}</strong>
          <small>Compare with today’s estimated profit</small>
        </article>
      </div>
      <p className={e.missing_cost_lines ? 'ux-warning' : 'ux-report-note'}>
        {e.missing_cost_lines
          ? `${e.missing_cost_lines} delivered item(s) still need product costs. Profit is incomplete.`
          : 'Profit remains an estimate until all costs have been recorded.'}{' '}
        Unrecorded delivery, overhead and advertising costs are excluded.
      </p>
      <section className="detail-card ux-funnel-section">
        <h2>How shoppers move toward an order</h2>
        <ol className="ux-funnel">
          {stages.map(([label, value, unit]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{unit}</small>
            </li>
          ))}
        </ol>
        <p className="ux-report-note">
          Counts for the selected period, not a single group of customers. A
          delivery may relate to an earlier order; repeated actions can count
          more than once.
        </p>
      </section>
      <details className="detail-card ux-disclosure">
        <summary>Collections — all time</summary>
        {Object.entries(d.collections || {}).map(([key, value]) => (
          <p key={key}>
            {key.replaceAll('_', ' ')}: <b>{formatMoney(Number(value))}</b>
          </p>
        ))}
      </details>
      <section className="detail-card">
        <h2>Campaign performance</h2>
        {!d.campaigns?.length && (
          <EmptyWork
            title="No attributed orders yet"
            description="Campaign results will appear when tracked visitors place orders."
          />
        )}
        {d.campaigns?.map((c: Row) => (
          <p key={c.campaign}>
            {c.campaign} · {c.orders} orders · {formatMoney(c.delivered_sales)}{' '}
            delivered sales
          </p>
        ))}
      </section>
      <section className="detail-card">
        <h2>Meta event tracking</h2>
        <p>
          {d.metaConfigured
            ? 'Configured — verify receipt in Meta Events Manager'
            : 'Not configured — connect tracking and verify receipt before launching ads.'}
        </p>
        {d.outbox?.map((o: Row) => (
          <p key={o.status}>
            {o.status}: {o.count}
          </p>
        ))}
        <button
          disabled={busy || !d.metaConfigured}
          className="button secondary"
          onClick={() => send({ action: 'flush_meta' })}
        >
          Send / retry queued Meta events
        </button>
      </section>
      <section className="detail-card">
        <h2>Record a direct cost</h2>
        <form
          className="address-form"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            send({ ...values, action: 'cost', amount: Number(values.amount) });
          }}
        >
          <label>
            Order number
            <input name="orderNumber" required />
          </label>
          <label>
            Category
            <select name="category">
              <option value="delivery">Delivery</option>
              <option value="material_adjustment">Material adjustment</option>
              <option value="advertising">Advertising allocation</option>
              <option value="other_direct">Other direct cost</option>
            </select>
          </label>
          <label>
            Amount (₹)
            <input name="amount" type="number" min="0" required />
          </label>
          <label>
            Explanation
            <input name="note" minLength={3} required />
          </label>
          <button className="button primary" disabled={busy}>
            Record cost
          </button>
        </form>
        {d.costs?.map((c: Row) => (
          <p key={c.id}>
            {c.order_number} · {c.category} · {formatMoney(c.amount)} · {c.note}
          </p>
        ))}
      </section>
    </>
  );
}
