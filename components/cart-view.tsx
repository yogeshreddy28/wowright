'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { ArrowRight, Minus, Plus, Trash2 } from 'lucide-react';
import { ShoppingSteps, CartIncentive } from './workflow-ui';
import { ShoppingBag } from 'lucide-react';
import { AppShell } from './app-shell';
import { ProductImage } from './product-image';
import { useStore } from './store-provider';
import { calculateCart, formatMoney } from '@/lib/services/pricing';
import { defaultDeliveryConfig } from '@/lib/services/delivery';
import { emitCompanionEvent } from '@/lib/companion/events';
import { launchTotals } from '@/lib/services/launch-rules';
export function CartView() {
  const { items, remove, quantity } = useStore();
  const totals = calculateCart(items, defaultDeliveryConfig);
  useEffect(() => {
    emitCompanionEvent('CART_VIEW', { metadata: { itemCount: items.length } });
  }, [items.length]);
  if (!items.length)
    return (
      <AppShell>
        <section className="empty-state">
          <ShoppingBag size={36} aria-hidden="true" />
          <h1>Your cart is ready for something personal.</h1>
          <p>
            Choose a product and make it yours, or tell us what you would like
            to create.
          </p>
          <Link className="button primary" href="/shop">
            Browse products <ArrowRight />
          </Link>
        </section>
      </AppShell>
    );
  return (
    <AppShell>
      <ShoppingSteps current="cart" />
      <section className="page-head compact ux-cart-head">
        <p className="eyebrow">Your WOW RIGHT selections</p>
        <h1>Your cart</h1>
        <p>Review the details before adding your delivery information.</p>
        <a className="ux-cart-jump" href="#cart-summary">
          Review total & checkout →
        </a>
      </section>
      <section className="cart-layout">
        <div className="cart-items">
          {items.map((item) => (
            <article key={item.id}>
              <ProductImage src={item.image} alt={item.name} />
              <div className="cart-item-main">
                <h2>{item.name}</h2>
                <small>{formatMoney(item.unitPrice)} each</small>
                <dl>
                  {item.variantName && (
                    <div>
                      <dt>Finish</dt>
                      <dd>{item.variantName}</dd>
                    </div>
                  )}
                  {Object.entries(item.selections).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="quantity-row">
                  <div>
                    <button
                      onClick={() => quantity(item.id, item.quantity - 1)}
                      aria-label="Decrease quantity"
                    >
                      <Minus />
                    </button>
                    <b>{item.quantity}</b>
                    <button
                      onClick={() => quantity(item.id, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus />
                    </button>
                  </div>
                  <button className="remove" onClick={() => remove(item.id)}>
                    <Trash2 /> Remove
                  </button>
                </div>
              </div>
              <strong>{formatMoney(item.unitPrice * item.quantity)}</strong>
            </article>
          ))}
        </div>
        <aside className="summary-card" id="cart-summary">
          <p className="eyebrow">Almost there</p>
          <h2>Order summary</h2>
          <div>
            <span>Products</span>
            <b>{formatMoney(totals.subtotal)}</b>
          </div>
          <div>
            <span>Delivery</span>
            <b>
              {totals.deliveryAmount
                ? formatMoney(totals.deliveryAmount)
                : 'Free'}
            </b>
          </div>
          <CartIncentive subtotal={totals.subtotal} />
          <div className="summary-total">
            <span>Total</span>
            <b>{formatMoney(totals.total)}</b>
          </div>
          <Link
            className="button primary full"
            href={launchTotals(totals.subtotal).missing ? '/shop' : '/checkout'}
          >
            {launchTotals(totals.subtotal).missing
              ? 'Continue shopping'
              : 'Continue to Checkout'}{' '}
            <ArrowRight />
          </Link>
          <small>Your order is saved securely at the end of checkout.</small>
        </aside>
      </section>
    </AppShell>
  );
}
