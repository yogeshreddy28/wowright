'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/services/pricing';
import { EmptyWork } from './workflow-ui';
import { AppShell } from './app-shell';
type Row = Record<string, any>;
const quoteLabel = (q: Row) =>
  q.order_id
    ? 'Order created'
    : q.status === 'quoted'
      ? 'Awaiting customer approval'
      : 'Needs a quote';
export function QuotesAdmin({
  data,
  reload,
}: {
  data: Row;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState('');
  return (
    <>
      <header className="admin-head">
        <div>
          <h1>Custom requests</h1>
          <p>
            Agree specifications and price. The customer approves in their
            account, then prepays through UPI.
          </p>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      <p className="ux-inline-notice">
        Request → Your quote → Customer approval → UPI confirmation → Production
      </p>
      <div className="ux-tabs" aria-label="Custom request stage">
        {[
          ['', 'All requests'],
          ['new', 'Needs a quote'],
          ['quoted', 'Awaiting approval'],
          ['ordered', 'Order created'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!data.quotes?.length && (
        <EmptyWork
          title="No custom ideas waiting"
          description="Submitted ideas, private reference files and quote approvals appear here."
        />
      )}
      {(data.quotes || [])
        .filter(
          (q: Row) =>
            !filter ||
            (filter === 'ordered'
              ? q.order_id
              : filter === 'quoted'
                ? q.status === 'quoted' && !q.order_id
                : !q.order_id && q.status !== 'quoted'),
        )
        .map((q: Row) => (
          <section className="detail-card" key={q.id}>
            <h2>
              {q.request_number} · {q.name}
            </h2>
            <p>
              {q.mobile} · {q.quantity} units · {quoteLabel(q)}
            </p>
            <p>{q.description}</p>
            <p>
              {q.dimensions} {q.desired_colour} {q.notes}
            </p>
            {data.files
              .filter((f: Row) => f.quote_request_id === q.id)
              .map((f: Row) => (
                <p key={f.id}>
                  <a href={`/api/admin/files/${f.id}`}>
                    Download {f.original_name}
                  </a>
                </p>
              ))}
            {q.order_id ? (
              <Link href={`/admin/orders/${q.order_id}`}>View order</Link>
            ) : (
              <details
                className="ux-secondary-details"
                open={q.status !== 'quoted'}
              >
                <summary>
                  {q.status === 'quoted'
                    ? 'Review or revise quote'
                    : 'Prepare a quote'}
                </summary>
                <form
                  className="address-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    try {
                      const values = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      const r = await fetch('/api/admin/quotes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            ...values,
                            requestId: q.id,
                            price: Number(values.price),
                          }),
                        }),
                        body = (await r.json()) as Row;
                      if (!r.ok) throw new Error(body.error);
                      await reload();
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Could not save quote',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Final specifications
                    <textarea
                      name="specifications"
                      required
                      minLength={10}
                      maxLength={5000}
                      defaultValue={q.specifications || ''}
                    />
                  </label>
                  <label>
                    Product subtotal for the entire request (₹)
                    <input
                      name="price"
                      type="number"
                      min={499}
                      required
                      defaultValue={q.quoted_price || ''}
                    />
                  </label>
                  <label>
                    Owner-reviewed delivery estimate
                    <input
                      name="deliveryEstimate"
                      type="date"
                      required
                      defaultValue={q.delivery_estimate || ''}
                    />
                  </label>
                  <p>
                    Delivery: ₹49 below ₹999; free from ₹999. Quote edits
                    invalidate earlier approval.
                  </p>
                  <button className="button primary" disabled={busy}>
                    Save quote for customer approval
                  </button>
                </form>
              </details>
            )}
          </section>
        ))}
    </>
  );
}
export function CustomerQuotes() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/account/quotes')
      .then(async (r) => {
        if (!r.ok)
          throw new Error('Sign in to view your customization requests.');
        setData((await r.json()) as Row);
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <AppShell>
      <section className="account-page">
        <h1>Your custom requests</h1>
        {error && (
          <p className="form-error" role="alert">
            {error} <Link href="/account">My account</Link>
          </p>
        )}
        {!data && !error && <p>Loading requests…</p>}
        {data && !data.quotes.length && (
          <p>
            No requests yet.{' '}
            <Link href="/custom-print">Describe your idea</Link>.
          </p>
        )}
        {(data?.quotes || []).map((q: Row) => (
          <section className="detail-card" key={q.id}>
            <h2>{q.request_number}</h2>
            <p>{q.description}</p>
            <b>
              {q.order_id
                ? 'Order created'
                : q.status === 'quoted'
                  ? 'Your quote is ready to review'
                  : 'We’re reviewing your idea'}
            </b>
            {q.quoted_price && (
              <>
                <h3>Specifications for approval</h3>
                <p>{q.specifications}</p>
                <p>
                  Products {formatMoney(q.quoted_price)} + delivery{' '}
                  {formatMoney(q.delivery_amount)} ={' '}
                  <b>{formatMoney(q.quoted_price + q.delivery_amount)}</b>
                </p>
                <p>Estimated delivery by {q.delivery_estimate}</p>
              </>
            )}
            {q.order_id ? (
              <Link href="/account">View My Orders</Link>
            ) : (
              q.status === 'quoted' && (
                <form
                  className="address-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    try {
                      const values = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      const r = await fetch('/api/account/quotes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            requestId: q.id,
                            version: q.quote_version,
                            accepted: values.accepted === 'on',
                            customer: values,
                          }),
                        }),
                        body = (await r.json()) as Row;
                      if (!r.ok) throw new Error(body.error);
                      window.location.assign(
                        `/order-success/${body.orderNumber}`,
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not approve quote',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="field-grid">
                    {[
                      ['name', 'Name'],
                      ['mobile', 'Account mobile'],
                      ['line1', 'Delivery address'],
                      ['locality', 'Area'],
                      ['pinCode', 'PIN code'],
                      ['latitude', 'Map pin latitude'],
                      ['longitude', 'Map pin longitude'],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input name={name} required />
                      </label>
                    ))}
                    <input type="hidden" name="city" value="Bengaluru" />
                    <input type="hidden" name="state" value="Karnataka" />
                  </div>
                  <label className="checkbox-line">
                    <input name="accepted" type="checkbox" required />I approve
                    these specifications, quantity and exact price. This is a
                    fully prepaid custom product. After approval, payment and
                    production start, ordinary cancellation is unavailable;
                    statutory rights remain protected.
                  </label>
                  <button className="button primary" disabled={busy}>
                    Approve & save UPI order
                  </button>
                </form>
              )
            )}
          </section>
        ))}
      </section>
    </AppShell>
  );
}
