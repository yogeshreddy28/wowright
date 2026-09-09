'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ClipboardCheck,
  Factory,
  PackageCheck,
  Truck,
  MapPin,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { QC_FIELDS } from '@/lib/services/production';
import {
  dateLabel,
  durationLabel,
  isOverdue,
  paymentLabel,
} from '@/lib/workflow-presentation';
import {
  DeliveryDate,
  EmptyWork,
  OrderFlow,
  StatusChip,
  WorkflowThumb,
} from './workflow-ui';
type Row = Record<string, any>;
const lanes = [
  ['all', 'All work'],
  ['waiting', 'Waiting'],
  ['printing', 'Printing'],
  ['qc', 'Quality check'],
  ['packing', 'Packing'],
  ['reprint', 'Reprint'],
  ['ready', 'Completed'],
  ['at-risk', 'At risk'],
];
function inLane(i: Row, lane: string) {
  return (
    lane === 'all' ||
    (lane === 'waiting' && i.production_status === 'queued') ||
    (lane === 'printing' && i.production_status === 'printing') ||
    (lane === 'qc' && i.production_status === 'quality_check') ||
    (lane === 'packing' && i.production_status === 'qc_passed') ||
    (lane === 'reprint' && i.production_status === 'reprint_required') ||
    (lane === 'ready' && Boolean(i.packed_at)) ||
    (lane === 'at-risk' &&
      isOverdue(
        i.promised_delivery_date || i.estimated_delivery_date,
        i.status,
      ))
  );
}
function canStart(i: Row) {
  return (
    i.estimated_print_minutes > 0 &&
    Number(i.allocated_today) >
      i.estimated_print_minutes * i.quantity * i.reprint_count
  );
}
export function ProductionAdmin({
  data,
  reload,
}: {
  data: Row;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [lane, setLane] = useState('all'),
    [orderFilter, setOrderFilter] = useState('');
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const stage = query.get('stage');
    if (stage && lanes.some(([id]) => id === stage)) setLane(stage);
    setOrderFilter(query.get('order') || '');
  }, []);
  async function action(
    orderId: string,
    itemId: string,
    command: string,
    form?: HTMLFormElement,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const values = form ? Object.fromEntries(new FormData(form)) : {};
    try {
      const r = await fetch('/api/admin/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          itemId,
          action: command,
          note: values.note,
          date: values.date,
          printMinutes: values.printMinutes
            ? Number(values.printMinutes)
            : undefined,
          checklist: Object.fromEntries(
            QC_FIELDS.map((k) => [k, values[k] === 'on']),
          ),
        }),
      });
      const body = (await r.json()) as Row;
      if (!r.ok) throw new Error(body.error);
      setNotice(
        (
          {
            print: 'Printing started. Send the finished item to quality check.',
            print_complete: 'Ready for the five-point quality check.',
            qc_pass: 'Quality check passed. This item can now be packed.',
            qc_fail: 'Reprint recorded. Check the delivery deadline.',
            pack: 'Item checked and packed.',
            ready: 'Package ready. Continue to Delivery to assign a run.',
            estimate: 'Estimate saved.',
            schedule: 'Production time allocated.',
          } as Row
        )[command] || 'Order updated.',
      );
      await reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not update production. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  const items = (data.items || []) as Row[];
  const recommended =
    items.find(
      (i) =>
        ['queued', 'reprint_required'].includes(i.production_status) &&
        canStart(i),
    ) ||
    items.find((i) =>
      ['queued', 'reprint_required'].includes(i.production_status),
    );
  const groups = Object.values(Object.groupBy(items, (i) => i.id)).filter(
    (g) =>
      g?.some((i) => inLane(i, lane)) &&
      (!orderFilter || g?.[0].order_number === orderFilter),
  );
  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">Make → check → pack</p>
          <h1>Production workspace</h1>
          <p>
            Move each item one step forward. An order is ready only when every
            item is checked and packed.
          </p>
        </div>
        <Link href="/admin/delivery" className="button secondary">
          <Truck size={17} />
          Delivery workspace
        </Link>
      </header>
      {error && (
        <p className="ux-screen-feedback error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ux-screen-feedback" role="status">
          {notice}
          {notice.startsWith('Package ready') && (
            <Link href="/admin/delivery"> Open Delivery →</Link>
          )}
        </p>
      )}
      {recommended && ['all', 'waiting', 'reprint'].includes(lane) && (
        <section className="ux-next-action">
          <WorkflowThumb
            src={recommended.product_image}
            name={recommended.product_name}
          />
          <div>
            <small>RECOMMENDED NEXT PRINT</small>
            <h2>
              {recommended.product_name} × {recommended.quantity}
            </h2>
            <p>
              {recommended.order_number} ·{' '}
              {durationLabel(
                recommended.estimated_print_minutes * recommended.quantity,
              )}
            </p>
            <DeliveryDate
              date={
                recommended.promised_delivery_date ||
                recommended.estimated_delivery_date
              }
              status={recommended.status}
            />
            <p className="ux-help">
              {isOverdue(
                recommended.promised_delivery_date ||
                  recommended.estimated_delivery_date,
                recommended.status,
              )
                ? 'Priority: this delivery date needs attention.'
                : 'Priority: earliest actionable order in the production queue.'}
            </p>
          </div>
          {canStart(recommended) ? (
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                action(recommended.id, recommended.item_id, 'print')
              }
            >
              <Factory size={17} />
              Start printing
            </button>
          ) : (
            <a
              className="button secondary"
              href={'#work-' + recommended.item_id}
            >
              Review print setup <ArrowRight size={17} />
            </a>
          )}
        </section>
      )}
      <div className="ux-tabs" role="group" aria-label="Production stages">
        {lanes.map(([id, label]) => (
          <button
            key={id}
            className={lane === id ? 'active' : ''}
            aria-pressed={lane === id}
            onClick={() => setLane(id)}
          >
            {label}
            <b>{items.filter((i) => inLane(i, id)).length}</b>
          </button>
        ))}
      </div>
      <div className="ux-workload-line">
        <span>
          <Factory size={16} />
          Daily capacity: {durationLabel(data.dailyCapacityMinutes)}
        </span>
        <span>
          Waiting workload:{' '}
          {!items.some((i) =>
            ['queued', 'reprint_required'].includes(i.production_status),
          )
            ? 'Nothing waiting to print'
            : durationLabel(
                items
                  .filter((i) =>
                    ['queued', 'reprint_required'].includes(
                      i.production_status,
                    ),
                  )
                  .reduce(
                    (sum, i) =>
                      sum + (i.estimated_print_minutes || 0) * i.quantity,
                    0,
                  ),
              )}
        </span>
        {orderFilter && (
          <button onClick={() => setOrderFilter('')}>
            Showing {orderFilter} · Clear filter
          </button>
        )}
      </div>
      {!groups.length && (
        <EmptyWork
          title={
            lane === 'qc'
              ? 'No orders need quality check'
              : lane === 'packing'
                ? 'Nothing waiting to pack'
                : 'No work in this stage'
          }
          description="As orders move forward, the next task appears here."
        />
      )}
      {groups.map((group) => {
        const rows = group!,
          o = rows[0],
          packed = rows.filter((i) => i.packed_at).length;
        return (
          <section className="detail-card ux-production-order" key={o.id}>
            <header className="ux-order-header">
              <div>
                <Link href={'/admin/orders/' + o.order_number}>
                  <h2>{o.order_number}</h2>
                </Link>
                <DeliveryDate
                  date={o.promised_delivery_date || o.estimated_delivery_date}
                  status={o.status}
                />
              </div>
              <StatusChip status={o.status} />
              {o.is_test === 1 && <small>TEST · excluded from sales</small>}
            </header>
            <OrderFlow status={o.status} compact />
            <div className="ux-packing-progress">
              <span>
                {packed} of {rows.length} line items packed
              </span>
              <progress value={packed} max={rows.length} />
              {packed < rows.length && (
                <small>All items must be packed before delivery.</small>
              )}
            </div>
            {rows.map((i) => (
              <article
                className={
                  'ux-work-item ' + (inLane(i, lane) ? '' : 'supporting')
                }
                key={i.item_id}
                id={'work-' + i.item_id}
              >
                <div className="ux-work-item-heading">
                  <WorkflowThumb src={i.product_image} name={i.product_name} />
                  <div>
                    <h3>
                      {i.product_name} × {i.quantity}
                    </h3>
                    <p>
                      {i.selected_finish || 'No finish selected'} ·{' '}
                      {durationLabel(i.estimated_print_minutes * i.quantity)}
                    </p>
                    <span className="ux-item-state">
                      {(
                        {
                          queued: 'Waiting to print',
                          qc_passed: 'Passed QC · ready to pack',
                          reprint_required: 'Reprint needed',
                          quality_check: 'Inspect this item',
                          packed: 'Packed and checked',
                          printing: 'Printing now',
                        } as Row
                      )[i.production_status] || 'Review item'}
                    </span>
                  </div>
                </div>
                {!i.estimated_print_minutes && (
                  <form
                    className="ux-inline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(o.id, i.item_id, 'estimate', e.currentTarget);
                    }}
                  >
                    <label>
                      Print time per unit (minutes)
                      <input
                        name="printMinutes"
                        type="number"
                        min="1"
                        max="43200"
                        required
                        placeholder="Enter your slicer estimate"
                      />
                    </label>
                    <button className="button secondary" disabled={busy}>
                      Save print time
                    </button>
                  </form>
                )}
                {['queued', 'reprint_required'].includes(i.production_status) &&
                  (canStart(i) ? (
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() => action(o.id, i.item_id, 'print')}
                    >
                      Start printing <ArrowRight size={16} />
                    </button>
                  ) : (
                    <p className="ux-help">
                      {!i.estimated_print_minutes
                        ? 'Add a print time, then allocate a production slot.'
                        : i.allocation_count
                          ? 'Next allocated work: ' +
                            dateLabel(i.next_print_date) +
                            '. Start becomes available when capacity is available.'
                          : 'A production slot needs to be allocated below.'}
                    </p>
                  ))}
                {i.production_status === 'printing' && (
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => action(o.id, i.item_id, 'print_complete')}
                  >
                    Print finished → Quality check
                  </button>
                )}
                {i.production_status === 'quality_check' && (
                  <div className="ux-qc-task">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(o.id, i.item_id, 'qc_pass', e.currentTarget);
                      }}
                    >
                      <h4>
                        <ClipboardCheck size={18} />
                        Inspect all {i.quantity} units
                      </h4>
                      <fieldset>
                        <legend className="sr-only">
                          Five-point quality check
                        </legend>
                        {QC_FIELDS.map((k, index) => (
                          <label key={k}>
                            <input name={k} type="checkbox" required />
                            <span>
                              {
                                [
                                  'Correct product',
                                  'Correct colour / finish',
                                  'Correct quantity',
                                  'No visible print failure or damage',
                                  'Finish acceptable',
                                ][index]
                              }
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <button className="button primary" disabled={busy}>
                        Pass → Send to packing
                      </button>
                    </form>
                    <details className="ux-failure">
                      <summary>Something wrong? Fail → Reprint</summary>
                      <p className="ux-help">
                        A reprint may move the delivery date. Review the
                        deadline after recording it.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          action(o.id, i.item_id, 'qc_fail', e.currentTarget);
                        }}
                      >
                        <label>
                          What needs fixing?
                          <input name="note" required maxLength={1000} />
                        </label>
                        <button className="button secondary" disabled={busy}>
                          Record failure & reprint
                        </button>
                      </form>
                    </details>
                  </div>
                )}
                {i.production_status === 'qc_passed' && (
                  <form
                    className="ux-pack-check"
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(o.id, i.item_id, 'pack');
                    }}
                  >
                    <label>
                      <input type="checkbox" required />
                      All {i.quantity} units, correct finish and order contents
                      are in the package.
                    </label>
                    <button className="button primary" disabled={busy}>
                      <PackageCheck size={17} />
                      Mark item packed
                    </button>
                  </form>
                )}
                {i.packed_at && (
                  <span className="ux-chip success">✓ Packed and checked</span>
                )}
              </article>
            ))}
            <footer className="ux-order-footer">
              {!rows.some((i) => i.allocation_count) &&
                rows.some((i) =>
                  ['queued', 'reprint_required'].includes(i.production_status),
                ) && (
                  <button
                    className="button secondary"
                    disabled={
                      busy || rows.some((i) => !i.estimated_print_minutes)
                    }
                    onClick={() => action(o.id, '', 'schedule')}
                  >
                    Allocate production slot
                  </button>
                )}
              {o.status !== 'ready' && (
                <button
                  className="button primary"
                  disabled={
                    busy || rows.some((i) => !i.packed_at || !i.qc_passed_at)
                  }
                  onClick={() => action(o.id, '', 'ready')}
                >
                  Package complete → Ready for delivery
                </button>
              )}
              {o.status === 'ready' && (
                <Link href="/admin/delivery" className="button primary">
                  Assign delivery run <ArrowRight size={16} />
                </Link>
              )}
            </footer>
            <details className="ux-secondary-details">
              <summary>Change the delivery estimate</summary>
              <form
                className="ux-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  action(o.id, '', 'estimate', e.currentTarget);
                }}
              >
                <label>
                  New date
                  <input name="date" type="date" required />
                </label>
                <label>
                  Reason
                  <input name="note" required maxLength={1000} />
                </label>
                <button className="button secondary" disabled={busy}>
                  Save revised date
                </button>
              </form>
            </details>
          </section>
        );
      })}
    </>
  );
}
export function DeliveryAdmin({
  data,
  reload,
}: {
  data: Row;
  reload: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [view, setView] = useState('ready');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const ready = (data.ready || []) as Row[],
    batches = (data.batches || []) as Row[],
    collections = (data.collections || []) as Row[];
  async function send(body: Row, form?: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/admin/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        result = (await r.json()) as Row;
      if (!r.ok) throw Error(result.error || 'Update failed');
      if (body.action === 'assign') {
        setSelected([]);
        setView('today');
      }
      form?.reset();
      await reload();
      setNotice(
        (
          {
            assign:
              'Run assigned. The delivery person can now see these stops.',
            settle: 'Collection reconciled with the owner.',
            cash_settlement: 'Cash handover recorded in the audit history.',
            person: 'Delivery login created.',
            disable: 'Delivery access disabled.',
          } as Row
        )[body.action] || 'Saved',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }
  const views = [
    [
      'ready',
      'Ready / unassigned',
      ready.filter((o) => o.status !== 'delivery_failed').length,
    ],
    [
      'today',
      'Today’s runs',
      batches.filter(
        (b) => b.delivery_date === today && b.status !== 'completed',
      ).length,
    ],
    [
      'road',
      'Out for delivery',
      batches.filter((b) => b.active_stops > 0).length,
    ],
    [
      'failed',
      'Failed / reschedule',
      ready.filter((o) =>
        ['delivery_failed', 'reschedule_required'].includes(o.status),
      ).length,
    ],
    [
      'completed',
      'Completed runs',
      batches.filter((b) => b.status === 'completed').length,
    ],
  ];
  views.push(['all-runs', 'All runs', batches.length]);
  const shownBatches = batches.filter((b) =>
    view === 'all-runs'
      ? true
      : view === 'completed'
        ? b.status === 'completed'
        : view === 'road'
          ? b.active_stops > 0
          : b.delivery_date === today && b.status !== 'completed',
  );
  const chosen = selected
    .map((id) => ready.find((o) => o.id === id))
    .filter(Boolean) as Row[];
  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">Ready → assign → hand over</p>
          <h1>Delivery workspace</h1>
          <p>
            Group complete packages into a run. The driver sees the route,
            handover checks and amount to collect.
          </p>
        </div>
        <Link href="/delivery" className="button secondary">
          <Truck size={17} />
          Driver view
        </Link>
      </header>
      {error && (
        <p role="alert" className="ux-screen-feedback error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="ux-screen-feedback">
          {notice}
        </p>
      )}
      <div className="ux-tabs" role="group" aria-label="Delivery stages">
        {views.map(([id, label, count]) => (
          <button
            key={String(id)}
            className={view === id ? 'active' : ''}
            aria-pressed={view === id}
            onClick={() => setView(String(id))}
          >
            {label}
            <b>{count}</b>
          </button>
        ))}
      </div>
      {['ready', 'failed'].includes(view) ? (
        <div className="ux-delivery-planner">
          <section className="ux-panel">
            <header>
              <h2>1. Choose packages</h2>
              <span>{selected.length} selected</span>
            </header>
            {!ready.filter((o) =>
              view === 'failed'
                ? ['delivery_failed', 'reschedule_required'].includes(o.status)
                : o.status !== 'delivery_failed',
            ).length && (
              <EmptyWork
                title={
                  view === 'failed'
                    ? 'No failed visits to review'
                    : 'No packages waiting for delivery'
                }
                description={
                  view === 'failed'
                    ? 'Any unsuccessful visit will appear here.'
                    : 'Finish QC and packing, then mark the order ready.'
                }
                href="/admin/production?stage=packing"
                action="Open packing"
              />
            )}
            {ready
              .filter((o) =>
                view === 'failed'
                  ? ['delivery_failed', 'reschedule_required'].includes(
                      o.status,
                    )
                  : o.status !== 'delivery_failed',
              )
              .map((o) => (
                <article
                  className={
                    'ux-package-choice ' +
                    (selected.includes(o.id) ? 'selected' : '')
                  }
                  key={o.id}
                >
                  <label>
                    <input
                      type="checkbox"
                      disabled={busy || o.status === 'delivery_failed'}
                      checked={selected.includes(o.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, o.id]
                            : selected.filter((id) => id !== o.id),
                        )
                      }
                    />
                    <div>
                      <strong>{o.order_number}</strong>
                      <span>
                        {o.name} · {o.locality}
                      </span>
                      <DeliveryDate
                        date={
                          o.promised_delivery_date || o.estimated_delivery_date
                        }
                        status={o.status}
                      />
                    </div>
                    <b>
                      {o.payment_status === 'cod'
                        ? formatMoney(o.total) + ' COD'
                        : paymentLabel(o.payment_status)}
                    </b>
                  </label>
                  <StatusChip status={o.status} />
                  {o.status === 'delivery_failed' && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                          const r = await fetch('/api/admin/production', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: 'reschedule',
                              orderId: o.id,
                            }),
                          });
                          const body = (await r.json()) as Row;
                          if (!r.ok) throw Error(body.error);
                          await reload();
                          setNotice(
                            'Approved for another run. Select the package to assign it.',
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : 'Could not reschedule',
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Approve another delivery attempt
                    </button>
                  )}
                </article>
              ))}
          </section>
          <section className="ux-panel ux-run-builder">
            <header>
              <h2>2. Plan & assign the run</h2>
            </header>
            <div className="ux-run-content">
              <p className="ux-help">
                Choose nearby areas together. Route suggestions use location
                pins, not live traffic estimates.
              </p>
              {!chosen.length && (
                <p className="ux-help">
                  Select ready packages to choose a delivery person and date.
                </p>
              )}
              {chosen.length > 0 && (
                <>
                  <ol className="ux-route-list">
                    {chosen.map((o, index) => (
                      <li key={o.id}>
                        <span>{index + 1}</span>
                        <div>
                          <b>{o.locality}</b>
                          <small>{o.order_number}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {!chosen.length && (
                    <p className="ux-help">
                      Select packages on the left to build a route.
                    </p>
                  )}
                  <div className="ux-run-total">
                    <span>{chosen.length} stops</span>
                    <b>
                      {formatMoney(
                        chosen
                          .filter((o) => o.payment_status === 'cod')
                          .reduce((sum, o) => sum + o.total, 0),
                      )}{' '}
                      COD to collect
                    </b>
                  </div>
                  <button
                    className="button secondary full"
                    disabled={busy || selected.length < 2}
                    onClick={() =>
                      setSelected(
                        (data.suggestedOrderIds || []).filter((id: string) =>
                          selected.includes(id),
                        ),
                      )
                    }
                  >
                    <MapPin size={16} />
                    Arrange nearby stops
                  </button>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send(
                        {
                          ...Object.fromEntries(new FormData(e.currentTarget)),
                          action: 'assign',
                          orderIds: selected,
                        },
                        e.currentTarget,
                      );
                    }}
                  >
                    <label>
                      Delivery person
                      <select name="personId" required>
                        <option value="">Choose who will deliver</option>
                        {(data.people || [])
                          .filter((p: Row) => p.active)
                          .map((p: Row) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {!(data.people || []).some((p: Row) => p.active) && (
                      <a className="ux-help" href="#delivery-people">
                        Add a delivery person below before assigning.
                      </a>
                    )}
                    <label>
                      Delivery date
                      <input name="date" type="date" required min={today} />
                    </label>
                    <label>
                      Delivery window
                      <input
                        name="timeWindow"
                        required
                        placeholder="Enter the agreed window"
                        maxLength={100}
                      />
                    </label>
                    <p className="ux-help">
                      This date and window become visible to the customer.
                    </p>
                    <button
                      className="button primary full"
                      disabled={busy || !selected.length}
                    >
                      {busy
                        ? 'Saving…'
                        : 'Assign ' + selected.length + ' stops'}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                </>
              )}
            </div>
          </section>
        </div>
      ) : (
        <section className="ux-batch-grid">
          {!shownBatches.length && (
            <EmptyWork
              title={
                view === 'completed'
                  ? 'No completed runs yet'
                  : view === 'road'
                    ? 'No deliveries on the road'
                    : 'No active delivery runs today'
              }
              description="Choose ready packages and assign a run to get started."
            />
          )}
          {shownBatches.map((b) => (
            <article className="detail-card ux-batch" key={b.id}>
              <header>
                <Truck size={21} />
                <div>
                  <h2>{b.person_name}</h2>
                  <p>
                    {dateLabel(b.delivery_date)} · {b.time_window}
                  </p>
                </div>
                <span
                  className={
                    'ux-chip ' +
                    (b.status === 'completed' ? 'success' : 'working')
                  }
                >
                  {b.status === 'completed'
                    ? 'Run complete'
                    : b.status === 'active'
                      ? 'On the road'
                      : 'Assigned'}
                </span>
              </header>
              <div className="ux-inline-stats">
                <span>
                  <b>{b.stops}</b>stops
                </span>
                <span>
                  <b>{b.completed_stops}</b>delivered
                </span>
                <span>
                  <b>{formatMoney(b.cod_remaining)}</b>COD remaining
                </span>
              </div>
              <progress
                value={b.completed_stops + b.failed_stops}
                max={b.stops || 1}
              />
              <ol className="ux-route-list">
                {JSON.parse(b.route || '[]').map((stop: Row, index: number) => (
                  <li key={index}>
                    <span>{index + 1}</span>
                    <div>
                      <b>{stop.area}</b>
                      <Link href={'/admin/orders/' + stop.order}>
                        {stop.order}
                      </Link>
                    </div>
                    <small>
                      {(
                        {
                          pending: 'Not started',
                          out_for_delivery: 'On the way',
                          arrived: 'At the door',
                          later_today: 'Return later',
                          failed: 'Failed',
                          delivered: 'Delivered',
                        } as Row
                      )[stop.status] || stop.status}
                    </small>
                  </li>
                ))}
              </ol>
              {b.failed_stops > 0 && (
                <p className="form-error">
                  {b.failed_stops} visits need review. Open Failed / reschedule.
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      <section className="detail-card" id="collections">
        <header className="ux-order-header">
          <div>
            <h2>Collections to reconcile</h2>
            <p className="ux-help">
              Record owner receipt after checking the cash or transfer.
            </p>
          </div>
          <span className="ux-chip">
            {
              collections.filter((p) => p.settlement_status === 'pending' && p.method !== 'cash')
                .length
            }{' '}
            awaiting receipt
          </span>
        </header>
        <div className="cash-reconciliation-grid">
          {(data.cashByPerson || []).map((person: Row) => (
            <article key={person.personId}>
              <h3>{person.name}</h3>
              <dl>
                <div><dt>Cash collected</dt><dd>{formatMoney(person.collected)}</dd></div>
                <div><dt>Handed over</dt><dd>{formatMoney(person.handedOver)}</dd></div>
                <div className="cash-held"><dt>Cash currently held</dt><dd>{formatMoney(person.held)}</dd></div>
                <div><dt>UPI recorded separately</dt><dd>{formatMoney(person.upiCollected || 0)}</dd></div>
              </dl>
              {person.held > 0 && (
                <form onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); void send({ action: 'cash_settlement', personId: person.personId, amount: Number(values.get('amount')), note: values.get('note') }, event.currentTarget); }}>
                  <label>Handover amount (₹)<input name="amount" type="number" min="1" max={person.held} required /></label>
                  <label>Note <input name="note" maxLength={300} placeholder="Optional receipt note" /></label>
                  <button className="button primary" disabled={busy}>Record cash handover</button>
                </form>
              )}
            </article>
          ))}
        </div>
        <details className="ux-secondary-details">
          <summary>Cash handover audit history</summary>
          {(data.settlementHistory || []).map((item: Row) => <p key={item.id}><b>{item.person_name}</b> · {formatMoney(item.amount)} · {new Date(item.created_at).toLocaleString('en-IN')}{item.note ? ` · ${item.note}` : ''}</p>)}
          {!data.settlementHistory?.length && <p>No cash handovers recorded yet.</p>}
        </details>
        {!collections.some((p) => p.settlement_status === 'pending' && p.method !== 'cash') && (
          <EmptyWork title="No collections waiting for owner receipt" />
        )}
        {collections
          .filter((p) => p.settlement_status === 'pending' && p.method !== 'cash')
          .map((p) => (
            <div className="ux-collection-row" key={p.id}>
              <div>
                <b>{p.order_number}</b>
                <small>
                  {p.person_name || 'Owner'} · {p.method}{' '}
                  {p.is_test ? '· TEST' : ''}
                </small>
              </div>
              <strong>{formatMoney(p.amount_collected)}</strong>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      'Confirm the owner has received ' +
                        formatMoney(p.amount_collected) +
                        ' for ' +
                        p.order_number +
                        '?',
                    )
                  )
                    send({ action: 'settle', collectionId: p.id });
                }}
              >
                Confirm received
              </button>
            </div>
          ))}
        <details className="ux-secondary-details">
          <summary>Reconciled collections</summary>
          {collections
            .filter((p) => p.settlement_status === 'settled')
            .map((p) => (
              <p key={p.id}>
                {p.order_number} · {p.method} ·{' '}
                {formatMoney(p.amount_collected)} · Received by owner
              </p>
            ))}
        </details>
      </section>
      <details
        className="detail-card ux-secondary-details"
        id="delivery-people"
      >
        <summary>
          Delivery people & access{' '}
          <span>
            {(data.people || []).filter((p: Row) => p.active).length} active
          </span>
        </summary>
        {(data.people || []).map((p: Row) => (
          <div className="ux-collection-row" key={p.id}>
            <div>
              <b>{p.name}</b>
              <small>
                {p.mobile} · {p.active ? 'Active' : 'Disabled'}
              </small>
            </div>
            {p.active === 1 && (
              <button
                className="text-action"
                onClick={() => {
                  if (confirm('Disable ' + p.name + '’s delivery access?'))
                    send({ action: 'disable', personId: p.id });
                }}
              >
                Disable access
              </button>
            )}
          </div>
        ))}
        <form
          className="ux-inline-form"
          onSubmit={(e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            send(
              {
                ...Object.fromEntries(new FormData(e.currentTarget)),
                action: 'person',
              },
              e.currentTarget,
            );
          }}
        >
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Mobile
            <input name="phone" required inputMode="tel" />
          </label>
          <label>
            Initial password
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Create delivery login
          </button>
        </form>
      </details>
    </>
  );
}
