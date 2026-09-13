'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, PackageCheck } from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { ProductImage } from './product-image';

const stages = [
  ['confirmed', 'Confirmed'],
  ['printing', 'Printing'],
  ['quality_check', 'Quality Check'],
  ['packing', 'Packed'],
  ['out_for_delivery', 'Out for Delivery'],
  ['delivered', 'Delivered'],
] as const;
const rank: Record<string, number> = {
  confirmed: 0,
  printing: 1,
  in_production: 1,
  quality_check: 2,
  packing: 3,
  packed: 3,
  ready: 3,
  scheduled: 3,
  out_for_delivery: 4,
  delivered: 5,
};

export function TrackingView({ token }: { token: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await fetch(`/api/track/${encodeURIComponent(token)}`);
      const body = (await response.json()) as any;
      if (!active) return;
      if (response.ok) setData(body);
      else setError(body.error || 'Tracking link not found.');
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  if (error)
    return (
      <main className="tracking-page">
        <section className="tracking-card">
          <h1>We could not open this tracking link</h1>
          <p>{error}</p>
          <Link className="button primary" href="/contact">
            Contact WOW RIGHT
          </Link>
        </section>
      </main>
    );
  if (!data)
    return (
      <main className="tracking-page">
        <section className="tracking-card">Loading your order…</section>
      </main>
    );
  const current = rank[data.order.status] ?? -1;
  return (
    <main className="tracking-page">
      <section className="tracking-card">
        <p className="eyebrow">WOW RIGHT order tracking</p>
        <h1>{data.order.order_number}</h1>
        <p>
          Your private link shows order progress without exposing your phone,
          address, internal notes or delivery-team details.
        </p>
        <div className="tracking-steps">
          {stages.map(([id, label], index) => (
            <div
              className={
                index <= current ? 'done' : index === current + 1 ? 'next' : ''
              }
              key={id}
            >
              {index <= current ? <Check /> : <Circle />}
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="tracking-products">
          {data.items.map((item: any, index: number) => (
            <article key={index}>
              <ProductImage src={item.image} alt={item.product_name} />
              <div>
                <h2>{item.product_name}</h2>
                <p>
                  {item.selected_finish ||
                    item.variant_name ||
                    'Standard finish'}{' '}
                  · Qty {item.quantity}
                </p>
              </div>
            </article>
          ))}
        </div>
        <dl className="tracking-summary">
          <div>
            <dt>Order total</dt>
            <dd>{formatMoney(data.order.total)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>
              {data.order.payment_method === 'COD'
                ? 'Cash on Delivery'
                : data.order.payment_status === 'paid'
                  ? 'UPI received'
                  : 'UPI payment pending'}
            </dd>
          </div>
          <div>
            <dt>Estimated delivery</dt>
            <dd>
              {data.order.promised_delivery_date ||
                data.order.estimated_delivery_date ||
                'We’ll update this after production planning'}
            </dd>
          </div>
        </dl>
        <p className="tracking-current">
          <PackageCheck /> Current stage:{' '}
          <b>
            {stages[current]?.[1] ||
              (data.order.status === 'payment_pending'
                ? 'UPI payment pending'
                : String(data.order.status).replaceAll('_', ' '))}
          </b>
        </p>
      </section>
    </main>
  );
}
