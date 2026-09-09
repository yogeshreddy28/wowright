'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from './app-shell';
import { formatMoney } from '@/lib/services/pricing';
import { OrderFlow, StatusChip, DeliveryDate } from './workflow-ui';
import { paymentLabel } from '@/lib/workflow-presentation';
import type { OrderStatus } from '@/lib/domain';
import { ReviewForm } from './reviews';
import { useStore } from './store-provider';
import { useRouter } from 'next/navigation';
import { ProductImage } from './product-image';
import { deliveredOrderReviewPrompt, type ReviewPromptItem } from '@/lib/services/review-eligibility';
type Data = {
  order: {
    order_number: string;
    status: OrderStatus;
    payment_status: string;
    payment_method: string;
    subtotal: number;
    delivery_amount: number;
    total: number;
    created_at: string;
    order_type?: string;
    estimated_delivery_date?: string;
    promised_delivery_date?: string;
    delivery_window?: string;
  };
  items: {
    id: string;
    product_name: string;
    variant_name?: string;
    quantity: number;
    line_total: number;
    image?: string;
    reviewed?: number;
  }[];
  timeline: { to_status: string; note?: string; created_at: string }[];
};
export function OrderView({ id }: { id: string }) {
  const store = useStore();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const [otp, setOtp] = useState<{ code: string; expiresAt: string } | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<(ReviewPromptItem & { image?: string }) | null>(null);
  const previousStatus = useRef<string | undefined>(undefined);
  const orderStatus = data?.order.status;
  const loadOrder = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Sign in with the account used for this order.'
            : 'We could not find that order.',
        );
      const body = await response.json() as Data;
      const eligible = body.items.filter((item) => !item.reviewed).map((item) => ({
        item_id: item.id,
        product_name: item.product_name,
        order_number: body.order.order_number,
        image: item.image,
      }));
      const prompt = deliveredOrderReviewPrompt({
        status: body.order.status,
        previousStatus: previousStatus.current,
        items: eligible,
        dismissedAt: (itemId) => Number(localStorage.getItem(`wow_review_dismissed_${itemId}`) || 0),
      });
      setData(body);
      if (prompt) setReviewPrompt((current) => current || prompt);
      previousStatus.current = body.order.status;
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not load that order.');
    }
  }, [id]);
  useEffect(() => {
    void loadOrder();
    const timer = window.setInterval(loadOrder, 8_000);
    return () => clearInterval(timer);
  }, [loadOrder]);
  useEffect(() => {
    if (orderStatus !== 'out_for_delivery') return;
    const loadOtp = () => fetch(`/api/orders/${encodeURIComponent(id)}/delivery-otp`, { cache: 'no-store' }).then(async (r) => r.ok ? await r.json() as { otp?: { code: string; expiresAt: string } | null } : null).then((body) => setOtp(body?.otp || null)).catch(() => {});
    void loadOtp(); const timer = window.setInterval(loadOtp, 15_000); return () => clearInterval(timer);
  }, [orderStatus, id]);
  async function act(action: 'cancel' | 'reorder') {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      const r = await fetch('/api/account/orders/' + encodeURIComponent(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = (await r.json()) as {
        items?: import('@/lib/domain').CartItem[];
        error?: string;
      };
      if (!r.ok)
        throw Error(result.error || 'This action could not be completed.');
      if (action === 'cancel') window.location.reload();
      else {
        result.items?.forEach((i) => store.add(i));
        router.push('/cart');
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <AppShell>
        <section className="empty-state">
          <h1>Order unavailable</h1>
          <p>{error}</p>
          <Link className="button primary" href="/account">
            Go to My Account
          </Link>
        </section>
      </AppShell>
    );
  if (!data)
    return (
      <AppShell>
        <section className="order-loading">
          <div className="skeleton" />
          <div className="skeleton" />
        </section>
      </AppShell>
    );
  const order = data.order;

  return (
    <AppShell>
      {reviewPrompt && (
        <div className="review-prompt-backdrop">
          <section className="review-prompt" role="dialog" aria-modal="true" aria-labelledby="order-review-prompt-title">
            <ProductImage src={reviewPrompt.image} alt={reviewPrompt.product_name} />
            <p className="eyebrow">Delivered · verified purchase</p>
            <h2 id="order-review-prompt-title">How was your order?</h2>
            <p>{reviewPrompt.product_name}</p>
            <ReviewForm
              itemId={reviewPrompt.item_id}
              open
              onSubmitted={() => {
                setReviewPrompt(null);
                void loadOrder();
              }}
            />
            <button type="button" className="button secondary" onClick={() => {
              localStorage.setItem(`wow_review_dismissed_${reviewPrompt.item_id}`, String(Date.now()));
              setReviewPrompt(null);
            }}>Not now</button>
          </section>
        </div>
      )}
      <section className="order-page">
        <div>
          <Link href="/account">← My orders</Link>
          <p className="eyebrow">Your order</p>
          <h1>{order.order_number}</h1>
          <p>
            Placed{' '}
            {new Date(order.created_at).toLocaleDateString('en-IN', {
              dateStyle: 'long',
            })}
          </p>
        </div>
        <div className="order-status-grid">
          <div>
            <span>Order status</span>
            <StatusChip status={order.status} />
          </div>
          <div>
            <span>Payment status</span>
            <b className="status-badge payment">
              {paymentLabel(order.payment_status)}
            </b>
          </div>
        </div>
        {order.status !== 'delivered' && order.status !== 'cancelled' && (
          <div className="ux-tracking-date">
            <small>Estimated delivery</small>
            <DeliveryDate
              date={
                order.promised_delivery_date || order.estimated_delivery_date
              }
              status={order.status}
            />
            {order.delivery_window &&
              ['scheduled', 'out_for_delivery'].includes(order.status) && (
                <p>{order.delivery_window}</p>
              )}
          </div>
        )}
        <OrderFlow status={order.status} customer />
        {otp && <section className="delivery-otp-customer" aria-live="polite"><p className="eyebrow">Delivery confirmation</p><h2>Your delivery verification code</h2><strong>{otp.code}</strong><p>Share this code only after you have checked and accepted the package and the required payment is complete.</p><small>Expires at {new Date(otp.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</small></section>}
        <div className="saved-order">
          <h2>Order details</h2>
          {data.items.map((item) => (
            <div key={item.id} className="saved-order-item">
              <ProductImage src={item.image} alt={item.product_name} />
              <span>
                {item.product_name} × {item.quantity}
                {item.variant_name && (
                  <small className="ux-order-finish">
                    Finish: {item.variant_name}
                  </small>
                )}
              </span>
              <b>{formatMoney(item.line_total)}</b>
              {order.status === 'delivered' && !item.reviewed && <ReviewForm itemId={item.id} onSubmitted={() => void loadOrder()} />}
              {order.status === 'delivered' && Boolean(item.reviewed) && <small className="review-complete">Review submitted</small>}
            </div>
          ))}
          <hr />
          <div>
            <span>Subtotal</span>
            <b>{formatMoney(order.subtotal)}</b>
          </div>
          <div>
            <span>Delivery</span>
            <b>{formatMoney(order.delivery_amount)}</b>
          </div>
          <div className="grand">
            <span>Total</span>
            <b>{formatMoney(order.total)}</b>
          </div>
        </div>
        {actionError && (
          <p role="alert" className="form-error">
            {actionError}
          </p>
        )}
        <Link className="button secondary" href="/account">
          Back to My Orders
        </Link>
        {order.order_type !== 'customizable' &&
          ['confirmed', 'order_placed', 'payment_pending'].includes(
            order.status,
          ) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    'Cancel this order before printing? Any received payment will be reviewed by support.',
                  )
                )
                  return;
                await act('cancel');
              }}
            >
              Cancel order
            </button>
          )}
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            await act('reorder');
          }}
        >
          {busy ? 'Please wait…' : 'Buy again at current prices'}
        </button>
      </section>
    </AppShell>
  );
}
