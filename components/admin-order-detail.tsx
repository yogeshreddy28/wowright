'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, MessageCircle, Wallet } from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { AdminLogin, AdminShell } from './admin-app';
import { DeliveryDate, OrderFlow, StatusChip } from './workflow-ui';
import { orderPresentation, paymentLabel } from '@/lib/workflow-presentation';
import { acknowledgeAdminOrder } from './admin-order-notifier';
export function AdminOrderDetail({ id }: { id: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/orders/' + id);
      if (r.status === 401) {
        setError('unauthorized');
        return;
      }
      if (!r.ok) throw Error('Could not load this order. Try again.');
      setData(await r.json());
      await acknowledgeAdminOrder(id);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order unavailable');
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [id, load]);
  if (error === 'unauthorized')
    return (
      <AdminLogin
        onDone={() => {
          setError('');
          load();
        }}
      />
    );
  async function patch(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/admin/orders/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error || 'Update failed');
      await load();
      setNotice('Order updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }
  const o = data?.order,
    p = o ? orderPresentation(o.status) : null;
  return (
    <AdminShell view="orders">
      <Link className="ux-row-link" href="/admin/orders">
        <ArrowLeft size={15} />
        All orders
      </Link>
      {error && (
        <p className="ux-screen-feedback error" role="alert">
          {error}
          <button onClick={load}>Try again</button>
        </p>
      )}
      {notice && (
        <p className="ux-screen-feedback" role="status">
          {notice}
        </p>
      )}
      {!o && !error ? (
        <p className="admin-loading">Loading order details…</p>
      ) : !o ? null : (
        <>
          <header className="admin-head">
            <div>
              <p className="eyebrow">Order workspace</p>
              <h1>{o.order_number}</h1>
              <DeliveryDate
                date={o.promised_delivery_date || o.estimated_delivery_date}
                status={o.status}
              />
            </div>
            <StatusChip status={o.status} />
          </header>
          <section className="detail-card">
            <OrderFlow status={o.status} />
            {!['delivered', 'cancelled'].includes(o.status) && (
              <div className="ux-order-next">
                <div>
                  <strong>{p!.instruction}</strong>
                  <p>Next: {p!.next}</p>
                </div>
                <Link
                  className="button primary"
                  href={
                    [
                      'payment_pending',
                      'awaiting_confirmation',
                      'payment_failed',
                    ].includes(o.status)
                      ? '#payment'
                      : p!.href.startsWith('/admin/production')
                        ? '/admin/production?order=' + o.order_number
                        : p!.href
                  }
                >
                  {[
                    'payment_pending',
                    'awaiting_confirmation',
                    'payment_failed',
                  ].includes(o.status)
                    ? 'Review payment'
                    : p!.href.includes('production')
                      ? 'Continue in Production'
                      : 'Continue in Delivery'}
                  <ArrowRight size={16} />
                </Link>
              </div>
            )}
          </section>
          <div className="admin-detail-grid">
            <div>
              <section className="detail-card">
                <h2>What’s in this order</h2>
                {data.items.map((i: any) => (
                  <div className="detail-item" key={i.id}>
                    <div>
                      <b>
                        {i.product_name} × {i.quantity}
                      </b>
                      <small>
                        {i.selected_finish ||
                          i.variant_name ||
                          'No finish selected'}{' '}
                        · {formatMoney(i.unit_price)} each
                      </small>
                      <small>{i.product_sku || 'No SKU recorded'}</small>
                      {data.customizations
                        .filter((c: any) => c.order_item_id === i.id)
                        .map((c: any) => (
                          <small key={c.id}>
                            {c.option_name}: {c.value}
                          </small>
                        ))}
                    </div>
                    <b>{formatMoney(i.line_total)}</b>
                  </div>
                ))}
                <div className="detail-total">
                  <span>Subtotal</span>
                  <b>{formatMoney(o.subtotal)}</b>
                  <span>Delivery</span>
                  <b>{formatMoney(o.delivery_amount)}</b>
                  <span>Total</span>
                  <b>{formatMoney(o.total)}</b>
                </div>
              </section>
              <details className="detail-card ux-secondary-details">
                <summary>
                  Order history <span>{data.timeline.length} updates</span>
                </summary>
                {data.timeline.map((t: any) => (
                  <div className="timeline-row" key={t.id}>
                    <span />
                    <div>
                      <b>{orderPresentation(t.to_status).label}</b>
                      <small>
                        {new Date(t.created_at).toLocaleString('en-IN')} ·{' '}
                        {t.actor}
                      </small>
                      {t.note && <p>{t.note}</p>}
                    </div>
                  </div>
                ))}
              </details>
              <details className="detail-card ux-secondary-details">
                <summary>
                  Customer conversation{' '}
                  <span>{data.conversation.length} messages</span>
                </summary>
                {data.conversation.length ? (
                  data.conversation.map((m: any) => (
                    <p className={'admin-message ' + m.role} key={m.id}>
                      <b>
                        {m.role === 'assistant'
                          ? 'WOW Assistant'
                          : m.role === 'customer'
                            ? 'Customer'
                            : m.role}
                      </b>
                      {m.message}
                    </p>
                  ))
                ) : (
                  <p>No conversation is linked to this order.</p>
                )}
              </details>
              <details className="detail-card ux-secondary-details">
                <summary>
                  Delivery proof & collections <span>Private</span>
                </summary>
                <p className="ux-help">
                  Only the owner can view these photos. They are never used as
                  public reviews.
                </p>
                {data.proofs?.length ? (
                  data.proofs.map((proof: any) => (
                    <p key={proof.id}>
                      <a
                        href={
                          '/api/delivery/proof?id=' +
                          encodeURIComponent(proof.id)
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        View private handover photo
                      </a>{' '}
                      · {new Date(proof.created_at).toLocaleString('en-IN')}
                    </p>
                  ))
                ) : (
                  <p>No delivery proof yet.</p>
                )}
                {data.collections?.map((c: any, index: number) => (
                  <p key={index}>
                    {c.method} · {formatMoney(c.amount_collected)} received of{' '}
                    {formatMoney(c.amount_due)} ·{' '}
                    {c.settlement_status === 'settled'
                      ? 'Reconciled with owner'
                      : 'Awaiting owner reconciliation'}
                  </p>
                ))}
                {data.deliveryVerification && <div className="admin-otp-status"><b>Customer delivery code</b><p>Status: {data.deliveryVerification.otp_status || 'Not generated'}</p>{data.deliveryVerification.override_reason && <p>Override reason: {data.deliveryVerification.override_reason}</p>}{data.deliveryVerification.status === 'otp_pending' && !['verified','admin_override'].includes(data.deliveryVerification.otp_status) && <form onSubmit={async (event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason') || ''); if (!confirm('Override customer OTP for this delivery? This is permanently audited.')) return; const response = await fetch('/api/admin/delivery/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stopId: data.deliveryVerification.stop_id, reason }) }); const body = await response.json() as { error?: string }; if (!response.ok) setError(body.error || 'Override failed.'); else { setNotice('Delivery OTP override recorded.'); await load(); } }}><label>Exceptional override reason<textarea name="reason" minLength={10} maxLength={500} required /></label><button className="button secondary" disabled={busy}>Record Admin override</button></form>}</div>}
              </details>
            </div>
            <aside>
              <section className="detail-card" id="payment">
                <h2>
                  <Wallet size={18} />
                  Payment
                </h2>
                <strong>{formatMoney(o.total)}</strong>
                <p>
                  <span className="ux-chip">
                    {paymentLabel(o.payment_status)}
                  </span>{' '}
                  · {o.payment_method}
                </p>
                {o.payment_status !== 'paid' &&
                  o.payment_method === 'UPI' &&
                  [
                    'payment_pending',
                    'awaiting_confirmation',
                    'confirmed',
                  ].includes(o.status) && (
                    <>
                      <p className="ux-help">
                        Only record UPI after you have verified the full amount
                        in your account. Opening WhatsApp is not payment.
                      </p>
                      <button
                        className="button primary full"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              'Have you verified receipt of ' +
                                formatMoney(o.total) +
                                ' by UPI? This records the full amount as paid.',
                            )
                          )
                            patch({
                              paymentStatus: 'paid',
                              paymentMethod: 'UPI',
                            });
                        }}
                      >
                        Confirm UPI received
                      </button>
                    </>
                  )}
                {o.payment_status === 'cod' && (
                  <p className="ux-help">
                    The delivery person records Cash or UPI collection at
                    handover.
                  </p>
                )}
                {!o.payment_method && o.payment_status !== 'paid' && (
                  <p className="ux-warning">
                    This older order has no recorded payment method. Review it
                    with the customer before production. Payment methods cannot
                    be changed in this workspace.
                  </p>
                )}
              </section>
              <section className="detail-card">
                <h2>Customer & delivery</h2>
                <b>{o.customer_name}</b>
                <p>
                  <a href={'tel:+' + o.mobile}>{o.mobile}</a>
                  {o.email && (
                    <>
                      <br />
                      {o.email}
                    </>
                  )}
                </p>
                <p>
                  {o.line1}
                  <br />
                  {o.line2 && (
                    <>
                      {o.line2}
                      <br />
                    </>
                  )}
                  {o.locality}, {o.city}
                  <br />
                  {o.state} {o.pin_code}
                </p>
                {o.landmark && (
                  <p>
                    <b>Landmark:</b> {o.landmark}
                  </p>
                )}
                {o.customer_notes && (
                  <p>
                    <b>Customer note:</b> {o.customer_notes}
                  </p>
                )}
                <a
                  className="button secondary full"
                  href={data.updateWhatsAppURL || 'https://wa.me/' + o.mobile}
                >
                  <MessageCircle size={17} />
                  {data.updateWhatsAppURL
                    ? 'Share current status'
                    : 'Contact on WhatsApp'}
                </a>
              </section>
              <section className="detail-card">
                <h2>Internal notes</h2>
                <p className="ux-help">Visible to your team only.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    patch({
                      internalNotes: new FormData(e.currentTarget).get('notes'),
                    });
                  }}
                >
                  <textarea
                    key={o.updated_at}
                    name="notes"
                    defaultValue={o.internal_notes || ''}
                    aria-label="Internal notes"
                  />
                  <button className="button secondary" disabled={busy}>
                    Save notes
                  </button>
                </form>
              </section>
              {!['cancelled', 'delivered'].includes(o.status) && (
                <details className="ux-secondary-details">
                  <summary>Cancel this order</summary>
                  <p>
                    Review any payment separately. Cancellation does not
                    automatically issue a refund.
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          'Cancel this order? Review any received payment separately.',
                        )
                      )
                        patch({ status: 'cancelled' });
                    }}
                  >
                    Cancel order
                  </button>
                </details>
              )}
            </aside>
          </div>
        </>
      )}
    </AdminShell>
  );
}
