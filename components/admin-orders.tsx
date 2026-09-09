'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Search } from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import {
  orderPresentation,
  paymentLabel,
  dateLabel,
} from '@/lib/workflow-presentation';
import { DeliveryDate, EmptyWork, StatusChip } from './workflow-ui';
type Row = Record<string, any>;
export function AdminOrders({ data }: { data: Row }) {
  const [q, setQ] = useState(''),
    [status, setStatus] = useState(''),
    [payment, setPayment] = useState(''),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function filter(
    query = q,
    state = status,
    method = payment,
    currentPage = 1,
  ) {
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        q: query,
        status: state,
        paymentStatus: method,
        page: String(currentPage),
      });
      const r = await fetch('/api/admin/orders?' + params);
      if (!r.ok) throw Error('Could not load orders. Please try again.');
      const body = (await r.json()) as Row;
      setRows(body.orders);
      setPage(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search),
      query = params.get('q') || '',
      state = params.get('status') || '',
      paymentState = params.get('paymentStatus') || '';
    setQ(query);
    setStatus(state);
    setPayment(paymentState);
    if (query || state || paymentState) void filter(query, state, paymentState);
  }, []);
  const shown = rows || data.orders || [];
  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">Every order, one clear next step</p>
          <h1>Orders</h1>
          <p>
            Open an order to review its payment, delivery date and next task.
          </p>
        </div>
      </header>
      <div className="ux-tabs" role="group" aria-label="Order views">
        {[
          ['', 'All orders'],
          ['needs_confirmation', 'Needs confirmation'],
          ['confirmed', 'Needs printing'],
          ['quality_check', 'Quality check'],
          ['ready', 'Ready for delivery'],
          ['out_for_delivery', 'On the road'],
          ['delivered', 'Delivered'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={status === id ? 'active' : ''}
            aria-pressed={status === id}
            disabled={busy}
            onClick={() => {
              setStatus(id);
              filter(q, id, payment);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="ux-order-search"
        onSubmit={(e) => {
          e.preventDefault();
          filter();
        }}
      >
        <label>
          <Search size={17} />
          <input
            aria-label="Search orders"
            placeholder="Order number, customer or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <select
          aria-label="Payment filter"
          value={payment}
          onChange={(e) => setPayment(e.target.value)}
        >
          <option value="">Any payment</option>
          <option value="awaiting_payment">Awaiting UPI</option>
          <option value="unpaid">Not paid</option>
          <option value="paid">Paid</option>
          <option value="cod">Cash on Delivery</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          aria-label="All order stages"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All stages</option>
          <option value="needs_confirmation">Needs confirmation</option>
          <option value="at_risk">Late / at risk</option>
          {[
            'payment_pending',
            'confirmed',
            'printing',
            'quality_check',
            'packing',
            'packed',
            'ready',
            'scheduled',
            'out_for_delivery',
            'delivered',
            'delivery_failed',
            'reschedule_required',
            'cancelled',
          ].map((id) => (
            <option key={id} value={id}>
              {orderPresentation(id).label}
            </option>
          ))}
        </select>
        <button className="button secondary" disabled={busy}>
          {busy ? 'Loading…' : 'Apply filters'}
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="admin-table-wrap ux-orders-table">
        <table>
          <thead>
            <tr>
              <th>Order / customer</th>
              <th>Items</th>
              <th>Stage & next step</th>
              <th>Delivery</th>
              <th>Total / payment</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((o: Row) => (
              <tr key={o.id}>
                <td>
                  <Link href={'/admin/orders/' + o.order_number}>
                    <b>{o.order_number}</b>
                  </Link>
                  <small>{o.customer_name}</small>
                  <small>{dateLabel(o.created_at)}</small>
                </td>
                <td>{o.products}</td>
                <td>
                  <StatusChip status={o.status} />
                  <small>Next: {orderPresentation(o.status).next}</small>
                </td>
                <td>
                  <DeliveryDate
                    date={o.promised_delivery_date || o.estimated_delivery_date}
                    status={o.status}
                  />
                </td>
                <td>
                  <b>{formatMoney(o.total)}</b>
                  <small>
                    {o.payment_method === 'UPI' ? 'UPI · ' : ''}
                    {paymentLabel(o.payment_status)}
                  </small>
                </td>
                <td>
                  <Link
                    className="ux-row-link"
                    href={'/admin/orders/' + o.order_number}
                  >
                    Open order <ArrowRight size={16} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <EmptyWork
            title="No orders in this view"
            description="Try another stage or clear the search. New orders will appear here when customers place them."
          />
        )}
      </div>
      <div className="ux-pagination">
        <span>
          Page {page} · {shown.length} orders shown
        </span>
        <button
          className="button secondary"
          disabled={busy || page === 1}
          onClick={() => filter(q, status, payment, page - 1)}
        >
          Previous
        </button>
        <button
          className="button secondary"
          disabled={busy || shown.length < 25}
          onClick={() => filter(q, status, payment, page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
