'use client';

import { FormEvent, useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Route, Store } from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';

type Row = Record<string, any>;
const statusLabels: Record<string, string> = {
  booked: 'Booked',
  approved: 'Approved',
  printing: 'Printing',
  ready: 'Ready',
  delivered: 'Delivered',
  paid: 'Paid',
};

export function FieldAdmin({ data, reload }: { data: Row; reload: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function action(body: Row) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error || 'Update failed.');
      setNotice('Saved.');
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-admin">
      <header className="admin-page-heading">
        <div><p className="eyebrow">Retail field team</p><h1>Field bookings</h1><p>Daily routes, shop visits and payable-on-delivery bookings.</p></div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <section className="field-admin-section">
        <h2><Route /> Employee days</h2>
        <div className="field-day-grid">
          {(data.days as Row[]).map((day) => (
            <article key={day.id}>
              <div><strong>{day.employee_name}</strong><span className={`status-badge ${day.status}`}>{day.status === 'active' ? 'Active now' : 'Ended'}</span></div>
              <small>{new Date(day.started_at).toLocaleString('en-IN')}{day.ended_at ? ` → ${new Date(day.ended_at).toLocaleTimeString('en-IN')}` : ''}</small>
              <dl><div><dt>Distance</dt><dd>{(Number(day.distance_metres || 0) / 1000).toFixed(1)} km</dd></div><div><dt>Shops</dt><dd>{day.shops_visited}</dd></div><div><dt>Bookings</dt><dd>{day.bookings}</dd></div><div><dt>No order</dt><dd>{day.no_orders}</dd></div><div><dt>Pieces</dt><dd>{day.pieces}</dd></div><div><dt>Value</dt><dd>{formatMoney(Number(day.booking_value || 0))}</dd></div></dl>
            </article>
          ))}
          {!data.days.length && <p className="empty-copy">No field sessions yet.</p>}
        </div>
      </section>

      <section className="field-admin-section">
        <h2><Store /> Bookings</h2>
        <div className="field-admin-bookings">
          {(data.bookings as Row[]).map((booking) => {
            const index = (data.statuses as string[]).indexOf(booking.status);
            const next = (data.statuses as string[])[index + 1];
            const items = JSON.parse(booking.items || '[]') as Row[];
            return <article key={booking.id}>
              <header><div><strong>{booking.booking_number}</strong><small>{booking.shop_name} · {booking.employee_name}</small></div><span className={`status-badge ${booking.status}`}>{statusLabels[booking.status] || booking.status}</span></header>
              <ul>{items.map((item, itemIndex) => <li key={itemIndex}>{item.productName} · {item.variantName} × {item.quantity} <b>{formatMoney(Number(item.lineTotal))}</b></li>)}</ul>
              <div className="field-booking-totals"><span>{booking.total_quantity} pieces</span><strong>{formatMoney(Number(booking.total_amount))}</strong><span>Payable on delivery · {booking.payment_status}</span></div>
              {next && <button className="button primary" disabled={busy} onClick={() => action({ action: 'advance_booking', bookingId: booking.id, status: next })}>Mark {statusLabels[next]}</button>}
            </article>;
          })}
          {!data.bookings.length && <p className="empty-copy">No retail bookings yet.</p>}
        </div>
      </section>

      <section className="field-admin-section">
        <h2><MapPin /> Recent shop visits</h2>
        <div className="field-visit-table">
          {(data.visits as Row[]).map((visit) => <article key={visit.id}>
            <span className={visit.requires_review ? 'visit-warning' : 'visit-ok'}>{visit.requires_review ? <AlertTriangle /> : <CheckCircle2 />}</span>
            <div><strong>{visit.shop_name}</strong><small>{visit.employee_name} · {new Date(visit.checked_in_at).toLocaleString('en-IN')}</small><small>{visit.distance_from_shop_metres == null ? 'Shop coordinates not registered' : `${Math.round(visit.distance_from_shop_metres)} m from registered shop`} · {visit.outcome.replaceAll('_', ' ')}{visit.no_order_reason ? ` · ${visit.no_order_reason}` : ''}</small></div>
          </article>)}
          {!data.visits.length && <p className="empty-copy">No shop visits yet.</p>}
        </div>
      </section>

      <section className="field-admin-section">
        <h2>Registered shops</h2>
        <div className="field-shop-admin-grid">
          {(data.shops as Row[]).map((shop) => <article key={shop.id}><strong>{shop.name}</strong><span>{shop.phone}</span><small>{shop.address}{shop.locality ? `, ${shop.locality}` : ''} · {shop.pin_code}</small><small>{shop.latitude == null ? 'Location not pinned' : 'GPS location registered'}</small></article>)}
        </div>
        <details className="field-add-shop">
          <summary>+ Register shop</summary>
          <form onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); action({ action: 'create_shop', ...values, latitude: values.latitude ? Number(values.latitude) : null, longitude: values.longitude ? Number(values.longitude) : null }).then(() => form.reset()); }}>
            <label>Store name<input name="name" required /></label>
            <label>Phone<input name="phone" type="tel" required /></label>
            <label className="wide">Address<input name="address" required /></label>
            <label>Locality<input name="locality" /></label>
            <label>PIN code<input name="pinCode" inputMode="numeric" pattern="560[0-9]{3}" required /></label>
            <label>City<input name="city" defaultValue="Bengaluru" required /></label>
            <label>State<input name="state" defaultValue="Karnataka" required /></label>
            <label>Latitude <small>optional</small><input name="latitude" type="number" step="any" /></label>
            <label>Longitude <small>optional</small><input name="longitude" type="number" step="any" /></label>
            <button className="button primary" disabled={busy}>Register shop</button>
          </form>
        </details>
      </section>
    </div>
  );
}
