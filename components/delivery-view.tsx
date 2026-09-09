'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Truck,
  Camera,
  Wallet,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { localDate } from '@/lib/services/production';
import { dateLabel } from '@/lib/workflow-presentation';
import { EmptyWork } from './workflow-ui';
type Row = Record<string, any>;
const stopLabels: Row = {
  pending: 'Ready to start',
  out_for_delivery: 'On the way',
  arrived: 'Ready for handover',
  later_today: 'Return later today',
  otp_pending: 'Customer verification',
  failed: 'Could not deliver',
  delivered: 'Delivered',
};
export function DeliveryView() {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [selectedId, setSelectedId] = useState(''),
    [showOther, setShowOther] = useState(false),
    [alternative, setAlternative] = useState('');
  async function load() {
    const r = await fetch('/api/delivery');
    if (r.status === 401) {
      setData({ unauthorized: true });
      return;
    }
    if (!r.ok) throw Error('Could not load your run. Try again.');
    setData((await r.json()) as Row);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function send(body: Row) {
    const r = await fetch('/api/delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await r.json()) as Row;
    if (!r.ok) throw Error(result.error || 'Update did not save. Try again.');
    await load();
  }
  async function action(body: Row) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await send(body);
      setAlternative('');
      setNotice(
        (
          {
            start: 'Stop started. Navigate to the customer.',
            arrive: 'Arrival saved. Complete the handover checks below.',
            later: 'Saved for a return visit today.',
            fail: 'The owner can now review and reschedule this delivery.',
          } as Row
        )[body.action] || 'Saved',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }
  async function prepareOtp(e: FormEvent<HTMLFormElement>, stop: Row) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const values = new FormData(e.currentTarget);
    try {
      const proof = new FormData();
      proof.set('file', values.get('proof')!);
      proof.set('stopId', stop.id);
      proof.set('consent', values.get('consent') === 'on' ? 'true' : 'false');
      const r = await fetch('/api/delivery/proof', {
          method: 'POST',
          body: proof,
        }),
        result = (await r.json()) as Row;
      if (!r.ok) throw Error(result.error);
      await send({
        stopId: stop.id,
        action: 'prepare_otp',
        proofId: result.id,
        accepted: values.get('accepted') === 'on',
        method: values.get('method') || undefined,
        amount: values.get('amount') ? Number(values.get('amount')) : undefined,
      });
      const otpResponse = await fetch('/api/delivery/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', stopId: stop.id }) });
      const otpResult = await otpResponse.json() as Row;
      if (!otpResponse.ok) throw Error(otpResult.error || 'Could not create the delivery code.');
      await load();
      setNotice('Handover saved. Ask the customer for the delivery code shown in My Orders.');
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not complete delivery. Keep this page open and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function otpAction(stopId: string, actionName: 'verify' | 'resend', code?: string) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/delivery/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionName, stopId, code }) });
      const body = await response.json() as Row;
      if (!response.ok) throw Error(body.error || 'Delivery code update failed.');
      await load();
      setNotice(actionName === 'verify' ? 'Customer code verified. You can now complete delivery.' : 'A new code is ready in the customer’s My Orders page.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Delivery code update failed.'); }
    finally { setBusy(false); }
  }
  const today = localDate(),
    stops = ((data?.stops || []) as Row[]).filter((s) =>
      showOther ? s.delivery_date !== today : s.delivery_date === today,
    );
  const pending = [...stops]
    .filter((s) => !['delivered', 'failed'].includes(s.status))
    .sort(
      (a, b) =>
        Number(a.status === 'later_today') -
          Number(b.status === 'later_today') ||
        Number(b.status === 'arrived') - Number(a.status === 'arrived') ||
        Number(b.status === 'out_for_delivery') -
          Number(a.status === 'out_for_delivery') ||
        a.sort_order - b.sort_order,
    );
  const done = stops.filter((s) => s.status === 'delivered'),
    failed = stops.filter((s) => s.status === 'failed'),
    selected = stops.find((s) => s.id === selectedId) || pending[0],
    canWork =
      selected?.delivery_date === today ||
      (selected?.delivery_date < today &&
        ['out_for_delivery', 'arrived', 'later_today'].includes(
          selected?.status,
        ));
  return (
    <main className="delivery-app ux-driver">
      <header className="ux-driver-header">
        <Link className="brand" href="/delivery">
          WOW <b>RIGHT</b>
        </Link>
        <span>
          <Truck size={17} />
          Delivery team
        </span>
      </header>
      {error && (
        <div role="alert" className="ux-screen-feedback error">
          {error}
          <button onClick={() => load().catch((e) => setError(e.message))}>
            Try again
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="ux-screen-feedback">
          {notice}
        </p>
      )}
      {!data ? (
        <p>Loading your run…</p>
      ) : data.unauthorized ? (
        <form
          className="detail-card ux-driver-login"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              const r = await fetch('/api/delivery/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              });
              if (!r.ok) throw Error('Check your mobile number and password.');
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Sign in failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="ux-driver-login-icon">
            <Truck />
          </div>
          <h1>Ready for your run?</h1>
          <p>Sign in to see your assigned stops and what to collect.</p>
          <label>
            Mobile number
            <input
              name="phone"
              inputMode="tel"
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button className="button primary full" disabled={busy}>
            {busy ? 'Signing in…' : 'Open my deliveries'}
            <ArrowRight size={17} />
          </button>
          <small>
            Need access? Ask the WOW RIGHT owner for your delivery login.
          </small>
        </form>
      ) : (
        <>
          <div className="ux-driver-title">
            <div>
              <p className="eyebrow">
                {data.person.name} · {dateLabel(today)}
              </p>
              <h1>{showOther ? 'Other assigned dates' : 'Today’s Run'}</h1>
            </div>
            <button
              className="button secondary"
              onClick={() => {
                setShowOther(!showOther);
                setSelectedId('');
              }}
            >
              {showOther ? 'Today' : 'Other dates'}
            </button>
          </div>
          <div className="ux-driver-stats">
            <div>
              <strong>{pending.length}</strong>
              <span>Remaining</span>
            </div>
            <div>
              <strong>{done.length}</strong>
              <span>Completed</span>
            </div>
            <div>
              <strong>
                {formatMoney(
                  pending
                    .filter((s) => s.payment_status === 'cod')
                    .reduce((sum, s) => sum + s.total, 0),
                )}
              </strong>
              <span>COD to collect</span>
            </div>
            <div className="cash-held">
              <strong>{formatMoney(data.cash?.held || 0)}</strong>
              <span>Cash to hand over</span>
            </div>
          </div>
          {!stops.length && (
            <EmptyWork
              title={
                showOther
                  ? 'No other assigned runs'
                  : 'No deliveries assigned today'
              }
              description="Your owner will assign ready packages here. Refresh when your run is ready."
            />
          )}
          {stops.length > 0 && !pending.length && (
            <EmptyWork
              title={
                failed.length
                  ? 'All visits finished — some need owner review'
                  : 'Your run is complete'
              }
              description={
                failed.length
                  ? 'Review the unsuccessful visits below with the owner before another delivery attempt.'
                  : 'Every assigned stop is delivered. Review your collections below and hand over any cash to the owner.'
              }
            />
          )}
          {selected && !['delivered', 'failed'].includes(selected.status) && (
            <section className="ux-driver-stop" key={selected.id}>
              <header>
                <small>
                  {selected.id === pending[0]?.id
                    ? 'NEXT RECOMMENDED STOP'
                    : 'SELECTED STOP'}{' '}
                  · {dateLabel(selected.delivery_date)}
                </small>
                <h2>{selected.locality}</h2>
                <span className="ux-chip">
                  {stopLabels[selected.status] || 'Review stop'}
                </span>
                <p>
                  {selected.order_number} · {selected.time_window}
                </p>
              </header>
              <div className="ux-stop-address">
                <h3>{selected.name}</h3>
                <p>
                  {selected.line1} {selected.line2}
                  <br />
                  {selected.locality}, {selected.pin_code}
                  {selected.landmark && (
                    <>
                      <br />
                      <b>Landmark:</b> {selected.landmark}
                    </>
                  )}
                </p>
                <a href={'tel:+' + selected.mobile}>
                  <Phone size={17} />
                  Call customer
                </a>
              </div>
              <details className="ux-parcel-details">
                <summary>Check parcel contents</summary>
                <ul>
                  {JSON.parse(selected.items || '[]').map(
                    (i: Row, n: number) => (
                      <li key={n}>
                        {i.name}
                        {i.finish ? ' · ' + i.finish : ''}
                        <b> × {i.quantity}</b>
                      </li>
                    ),
                  )}
                </ul>
              </details>
              {selected.availability_note && (
                <p className="ux-driver-note">
                  Return visit: {selected.availability_note}
                </p>
              )}
              {canWork ? (
                <>
                  <a
                    className="button primary full ux-navigate"
                    target="_blank"
                    rel="noreferrer"
                    href={
                      'https://www.google.com/maps/dir/?api=1&destination=' +
                      selected.latitude +
                      ',' +
                      selected.longitude
                    }
                    onClick={(event) => {
                      if (busy) {
                        event.preventDefault();
                        return;
                      }
                      if (selected.status === 'pending')
                        void action({ stopId: selected.id, action: 'start' });
                    }}
                  >
                    <Navigation />
                    Navigate
                  </a>
                  <small className="ux-help">
                    {selected.status === 'pending'
                      ? 'Navigation starts this stop and opens Maps.'
                      : 'Maps opens separately. Return here for the handover.'}
                  </small>
                  {!['arrived', 'later_today', 'pending', 'otp_pending'].includes(
                    selected.status,
                  ) && (
                    <button
                      className="button secondary full"
                      disabled={busy}
                      onClick={() =>
                        action({ stopId: selected.id, action: 'arrive' })
                      }
                    >
                      <MapPin size={18} />
                      I’ve arrived
                    </button>
                  )}
                  {selected.status === 'pending' && (
                    <button
                      className="button secondary full"
                      disabled={busy}
                      onClick={() =>
                        action({ stopId: selected.id, action: 'start' })
                      }
                    >
                      Start stop without Maps
                    </button>
                  )}
                  {selected.status === 'later_today' && (
                    <button
                      className="button secondary full"
                      disabled={busy}
                      onClick={() =>
                        action({ stopId: selected.id, action: 'arrive' })
                      }
                    >
                      I’m back at this stop
                    </button>
                  )}
                </>
              ) : (
                <p className="ux-driver-note">
                  This run is assigned for {dateLabel(selected.delivery_date)}.
                  Delivery actions become available on that date.
                </p>
              )}
              {canWork &&
                ['arrived', 'later_today'].includes(selected.status) && (
                  <form
                    className="ux-handover"
                    onSubmit={(e) => prepareOtp(e, selected)}
                  >
                    <fieldset>
                      <legend>
                        <span>1</span>Open-box handover
                      </legend>
                      <p>
                        Let the customer check the product, finish, quantity and
                        condition.
                      </p>
                      <label className="checkbox-line">
                        <input name="accepted" type="checkbox" required />
                        Customer inspected the order and accepts it.
                      </label>
                    </fieldset>
                    <fieldset>
                      <legend>
                        <span>2</span>
                        {selected.payment_status === 'cod'
                          ? 'Collect payment'
                          : 'Payment checked'}
                      </legend>
                      {selected.payment_status === 'cod' ? (
                        <>
                          <div className="ux-collection-amount">
                            <Wallet />
                            <span>
                              Collect exactly
                              <strong>{formatMoney(selected.total)}</strong>
                            </span>
                          </div>
                          <div className="ux-payment-radios">
                            <label>
                              <input
                                type="radio"
                                name="method"
                                value="cash"
                                required
                              />
                              Cash
                            </label>
                            <label>
                              <input
                                type="radio"
                                name="method"
                                value="UPI"
                                required
                              />
                              UPI
                            </label>
                          </div>
                          <label>
                            Amount actually received (₹)
                            <input
                              name="amount"
                              type="number"
                              required
                              min={selected.total}
                              max={selected.total}
                              inputMode="decimal"
                              placeholder={String(selected.total)}
                            />
                          </label>
                          <small>
                            For UPI, verify receipt before recording collection.
                          </small>
                        </>
                      ) : (
                        <p className="ux-paid">
                          <CheckCircle2 size={18} />
                          {selected.payment_status === 'paid'
                            ? 'Payment already confirmed. Do not collect again.'
                            : 'Payment needs owner review before handover.'}
                        </p>
                      )}
                    </fieldset>
                    <fieldset>
                      <legend>
                        <span>3</span>Private proof photo
                      </legend>
                      <label className="checkbox-line">
                        <input name="consent" type="checkbox" required />
                        Customer agrees to a private delivery-proof photo.
                      </label>
                      <label className="ux-photo-input">
                        <Camera />
                        Add handover photo
                        <input
                          name="proof"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          capture="environment"
                          required
                        />
                      </label>
                      <small>
                        Owner-only photo. If consent is declined, contact the
                        owner; do not take a photo without permission.
                      </small>
                    </fieldset>
                    <button className="button primary full" disabled={busy}>
                      {busy ? 'Saving handover…' : 'Generate customer code'}
                      <CheckCircle2 size={18} />
                    </button>
                  </form>
                )}
              {canWork && selected.status === 'otp_pending' && (
                <section className="ux-handover otp-handover">
                  <fieldset>
                    <legend><span>4</span>Customer confirmation</legend>
                    <p>Ask the customer to open My Orders and share the code only after checking and accepting the package.</p>
                    {selected.otp_status !== 'verified' ? (
                      <form onSubmit={(event) => { event.preventDefault(); void otpAction(selected.id, 'verify', String(new FormData(event.currentTarget).get('code') || '')); }}>
                        <label>6-digit delivery code<input name="code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required /></label>
                        <button className="button primary full" disabled={busy}>{busy ? 'Checking…' : 'Verify code'}</button>
                      </form>
                    ) : <div className="ux-paid"><CheckCircle2 /> Customer code verified.</div>}
                    <button type="button" className="button secondary full" disabled={busy} onClick={() => void otpAction(selected.id, 'resend')}>Generate a new code</button>
                  </fieldset>
                  {selected.otp_status === 'verified' && <button type="button" className="button primary full" disabled={busy} onClick={async () => { try { setBusy(true); await send({ stopId: selected.id, action: 'complete' }); setNotice('Delivery completed. Payment, proof and customer confirmation are saved.'); setSelectedId(''); } catch (e) { setError(e instanceof Error ? e.message : 'Could not complete delivery.'); } finally { setBusy(false); } }}>Complete delivery <CheckCircle2 size={18} /></button>}
                </section>
              )}
              {canWork && selected.status !== 'pending' && (
                <div className="ux-delivery-alternatives">
                  <p>Can’t complete the handover?</p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setAlternative('later')}
                  >
                    Deliver Later Today
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setAlternative('fail')}
                  >
                    Could Not Deliver
                  </button>
                  {alternative && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        action({
                          stopId: selected.id,
                          action: alternative,
                          note: new FormData(e.currentTarget).get('note'),
                        });
                      }}
                    >
                      <label>
                        {alternative === 'later'
                          ? 'When can the customer receive it today?'
                          : 'What prevented delivery?'}
                        <textarea name="note" required maxLength={1000} />
                      </label>
                      <button className="button primary" disabled={busy}>
                        Save{' '}
                        {alternative === 'later'
                          ? 'return visit'
                          : 'failed visit'}
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => setAlternative('')}
                      >
                        Go back
                      </button>
                    </form>
                  )}
                </div>
              )}
            </section>
          )}
          {pending.length > 1 && (
            <section className="ux-driver-list">
              <h2>Remaining stops</h2>
              {pending.map((s, index) => (
                <button
                  key={s.id}
                  className={selected?.id === s.id ? 'selected' : ''}
                  onClick={() => {
                    setSelectedId(s.id);
                    setAlternative('');
                  }}
                >
                  <span>{index + 1}</span>
                  <div>
                    <b>{s.locality}</b>
                    <small>
                      {s.order_number} · {stopLabels[s.status]}
                    </small>
                  </div>
                  <ArrowRight size={17} />
                </button>
              ))}
            </section>
          )}
          <details className="ux-secondary-details">
            <summary>
              Run summary{' '}
              <span>
                {done.length} delivered · {failed.length} not delivered
              </span>
            </summary>
            {done.length === 0 && failed.length === 0 ? (
              <p>No completed visits yet.</p>
            ) : (
              stops
                .filter((s) => ['delivered', 'failed'].includes(s.status))
                .map((s) => (
                  <p key={s.id}>
                    <b>{s.order_number}</b> · {stopLabels[s.status]}
                    {s.failure_reason ? ' · ' + s.failure_reason : ''}
                  </p>
                ))
            )}
            <h3>Recorded collections today</h3>
            <p>
              {data.collections
                .map((c: Row) => c.method + ': ' + formatMoney(c.amount))
                .join(' · ') || 'No collections recorded today.'}
            </p>
            <small>
              Hand over collected cash and reconcile it with the owner.
            </small>
          </details>
          <button
            className="text-action"
            disabled={busy}
            onClick={async () => {
              try {
                await fetch('/api/delivery/login', { method: 'DELETE' });
                await load();
              } catch {
                setError('Could not sign out. Try again.');
              }
            }}
          >
            Sign out
          </button>
        </>
      )}
      <footer className="ux-driver-footer">
        <Link href="/">
          <ArrowLeft size={15} />
          WOW RIGHT store
        </Link>
        <span>Only your assigned deliveries appear here.</span>
      </footer>
    </main>
  );
}
