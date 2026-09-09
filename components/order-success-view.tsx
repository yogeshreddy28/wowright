'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, MessageCircle, ShoppingBag } from 'lucide-react';
import { ShoppingSteps, StatusChip } from './workflow-ui';
import { paymentLabel } from '@/lib/workflow-presentation';
import { AppShell } from './app-shell';
import { emitCompanionEvent } from '@/lib/companion/events';
import { formatMoney } from '@/lib/services/pricing';

type OrderData = {
  whatsappUrl?: string;
  order: {
    order_number: string;
    status: string;
    payment_status: string;
    payment_method: string;
    total: number;
  };
};
export function OrderSuccessView({ orderId }: { orderId: string }) {
  const [wa, setWa] = useState('');
  const [data, setData] = useState<OrderData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<OrderData>;
      })
      .then((body) => {
        setData(body);
        setWa(body.whatsappUrl || '');
      })
      .catch(() => setError(true));
    emitCompanionEvent('CHECKOUT_COMPLETED', { metadata: { orderId } });
  }, [orderId]);
  const upi = data?.order.payment_method === 'UPI';
  const pending =
    upi &&
    ['unpaid', 'awaiting_payment'].includes(data?.order.payment_status || '') &&
    data?.order.status !== 'cancelled';
  if (!data)
    return (
      <AppShell>
        <section className="empty-state">
          <h1>{error ? 'Order unavailable' : 'Checking your saved order…'}</h1>
          {error && (
            <>
              <p>Sign in to view the order saved to your account.</p>
              <Link className="button primary" href="/account">
                My account
              </Link>
            </>
          )}
        </section>
      </AppShell>
    );
  function recordHandoff() {
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'UPIWhatsAppHandoff',
        path: `/order-success/${orderId}`,
        metadata: { orderId },
      }),
    }).catch(() => {});
    emitCompanionEvent('WHATSAPP_OPENED', {
      metadata: { orderId, automatic: false },
    });
  }
  return (
    <AppShell>
      <ShoppingSteps current="saved" />
      <section className="success-page">
        <div className="success-check">
          <Check />
        </div>
        <p className="eyebrow">Saved securely by WOW RIGHT</p>
        <h1>{pending ? 'Your order has been saved' : 'Your saved order'}</h1>
        <strong className="success-order-id">{orderId}</strong>
        <p>
          {pending
            ? 'Continue on WhatsApp to complete UPI payment. The order remains payment pending until WOW RIGHT confirms it.'
            : 'Your order is in My Orders. View its latest progress, payment status and delivery details below.'}
        </p>
        {data && (
          <div className="status-notice">
            <span>Order status</span>
            <StatusChip status={data.order.status} />
            <span>Payment</span>
            <b>{paymentLabel(data.order.payment_status)}</b>
            <span>Total</span>
            <b>{formatMoney(data.order.total)}</b>
          </div>
        )}
        {pending && wa && (
          <a className="button whatsapp" href={wa} onClick={recordHandoff}>
            <MessageCircle /> Continue on WhatsApp for UPI Payment
          </a>
        )}
        <Link
          className={`button ${pending ? 'secondary' : 'primary'}`}
          href={`/order/${orderId}`}
        >
          Track your order
        </Link>
        <Link className="button secondary" href="/shop">
          <ShoppingBag /> Continue Shopping
        </Link>
      </section>
    </AppShell>
  );
}
