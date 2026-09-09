'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { ShoppingSteps, CartIncentive } from './workflow-ui';
import { AppShell } from './app-shell';
import { useStore } from './store-provider';
import { calculateCart, formatMoney } from '@/lib/services/pricing';
import {
  defaultDeliveryConfig,
  type DeliveryConfig,
} from '@/lib/services/delivery';
import { emitCompanionEvent } from '@/lib/companion/events';
import { useCompanion } from './wow-companion/companion-context';
import { launchTotals } from '@/lib/services/launch-rules';
import { trackCommerce } from '@/lib/analytics-client';
import { AddressLocationPicker } from './address-location-picker';
import { ProductImage } from './product-image';
import { AddressLabelSelector } from './address-label-selector';
const states = [
  'Karnataka',
  'Andhra Pradesh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Kerala',
  'Maharashtra',
  'Tamil Nadu',
  'Telangana',
  'West Bengal',
  'Other',
];
export function CheckoutForm() {
  const store = useStore();
  const companion = useCompanion();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [account, setAccount] = useState<{ name: string; mobile: string; email?: string } | null>(null);
  const [preview, setPreview] = useState<{
    key: string;
    totals?: ReturnType<typeof launchTotals>;
    estimatedDeliveryDate?: string | null;
    error?: string;
  } | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [addressLabelType, setAddressLabelType] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'UPI'>('COD');
  const [addresses, setAddresses] = useState<
    Array<Record<string, string | number>>
  >([]);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig>(
    defaultDeliveryConfig,
  );
  const [paymentConfig, setPaymentConfig] = useState({
    codEnabled: true,
    upiEnabled: true,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const cartTotals = useMemo(
    () => calculateCart(store.items, deliveryConfig),
    [store.items, deliveryConfig],
  );
  const previewKey = JSON.stringify(
    store.items.map(
      ({ productId, variantId, quantity, unitPrice, selections }) => ({
        productId,
        variantId,
        quantity,
        unitPrice,
        selections,
      }),
    ),
  );
  const currentPreview = preview?.key === previewKey ? preview : null;
  const totals = currentPreview?.totals || cartTotals;
  useEffect(() => {
    if (!authenticated || previewKey === '[]') return;
    const controller = new AbortController();
    setPreview(null);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/checkout/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: JSON.parse(previewKey) }),
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          error?: string;
          totals: ReturnType<typeof launchTotals>;
          estimatedDeliveryDate: string | null;
        };
        if (!response.ok)
          throw new Error(
            body.error || 'We could not check your order. Please try again.',
          );
        if (!controller.signal.aborted)
          setPreview({
            key: previewKey,
            totals: body.totals,
            estimatedDeliveryDate: body.estimatedDeliveryDate,
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setPreview({
            key: previewKey,
            error:
              error instanceof Error
                ? error.message
                : 'We could not check your order. Please try again.',
          });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [authenticated, previewKey, previewAttempt]);
  useEffect(() => {
    trackCommerce('InitiateCheckout', { cartSize: store.items.length });
    emitCompanionEvent('CHECKOUT_STARTED', {
      metadata: { cartSize: store.items.length },
    });
  }, [store.items.length, store.sessionId]);
  useEffect(() => {
    fetch('/api/account/addresses')
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              addresses: Array<Record<string, string | number>>;
            }>)
          : { addresses: [] },
      )
      .then((body) => setAddresses(body.addresses))
      .catch(() => {});
    fetch('/api/account')
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              customer: { name: string; mobile: string; email?: string };
            }>)
          : null,
      )
      .then((body) => {
        setAuthenticated(Boolean(body));
        if (!body) {
          router.replace('/account?returnTo=checkout');
          return;
        }
        setAccount(body.customer);
        if (!formRef.current) return;
        const values = {
          name: body.customer.name,
          mobile: body.customer.mobile.replace(/^91/, ''),
          email: body.customer.email || '',
        };
        for (const [name, value] of Object.entries(values)) {
          const field = formRef.current.elements.namedItem(name);
          if (field instanceof HTMLInputElement) field.value = value;
        }
      })
      .catch(() => setAuthenticated(false));
    fetch('/api/store/config')
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{
              delivery: DeliveryConfig;
              payment: { codEnabled: boolean; upiEnabled: boolean };
            }>)
          : null,
      )
      .then((body) => {
        if (body) {
          setDeliveryConfig(body.delivery);
          setPaymentConfig(body.payment);
          if (!body.payment.codEnabled && body.payment.upiEnabled)
            setPaymentMethod('UPI');
        }
      })
      .catch(() => {});
  }, [router]);
  function applyAddress(id: string) {
    const address = addresses.find((item) => item.id === id);
    if (!address || !formRef.current) return;
    const mapping: Record<string, string> = {
      line1: 'line1',
      line2: 'line2',
      locality: 'locality',
      city: 'city',
      state: 'state',
      pin_code: 'pinCode',
      landmark: 'landmark',
      latitude: 'latitude',
      longitude: 'longitude',
    };
    for (const [source, target] of Object.entries(mapping)) {
      const field = formRef.current.elements.namedItem(target);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      )
        field.value = String(address[source] || '');
    }
    setSelectedAddressId(id);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    if (!authenticated) {
      router.push('/account?returnTo=checkout');
      return;
    }
    setLoading(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const customer = Object.fromEntries(form.entries());
    const idem =
      sessionStorage.getItem('wow_checkout_key') || crypto.randomUUID();
    sessionStorage.setItem('wow_checkout_key', idem);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idem,
        },
        body: JSON.stringify({
          sessionId: store.sessionId,
          items: store.items,
          customer: { ...customer, addressId: selectedAddressId || undefined },
          paymentMethod,
          analyticsConsent:
            localStorage.getItem('wow_analytics_consent') === 'granted',
          companion: {
            engaged: companion.context.companionEngaged,
            assistedCart:
              companion.context.companionEngaged &&
              companion.context.behavior.lastEvent === 'ADD_TO_CART',
            assistedCheckout: companion.context.companionEngaged,
            conversationId: companion.context.conversationId,
            campaign: companion.context.campaign,
          },
        }),
      });
      const data = (await r.json()) as {
        orderNumber?: string;
        paymentMethod?: 'COD' | 'UPI';
        url?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error || 'We could not save your order');
      emitCompanionEvent('CHECKOUT_COMPLETED', {
        metadata: { orderNumber: data.orderNumber, total: totals.total },
      });
      store.clear();
      store.notify(
        paymentMethod === 'COD'
          ? 'Cash on Delivery order placed.'
          : 'Order saved. Continue on WhatsApp for UPI payment.',
      );
      sessionStorage.removeItem('wow_checkout_key');
      router.push(
        `/order-success/${data.orderNumber}?method=${paymentMethod}${data.url ? `&wa=${encodeURIComponent(data.url)}` : ''}`,
      );
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Checkout failed. Please try again.';
      setError(message);
      emitCompanionEvent('CHECKOUT_VALIDATION_ERROR', {
        metadata: { message },
      });
    } finally {
      setLoading(false);
    }
  }
  if (!store.items.length)
    return (
      <AppShell>
        <section className="empty-state">
          <h1>Your cart is empty.</h1>
          <p>Add a product before checking out.</p>
          <Link className="button primary" href="/shop">
            Go to shop
          </Link>
        </section>
      </AppShell>
    );
  if (authenticated !== true)
    return (
      <AppShell>
        <ShoppingSteps current="account" />
        <section className="empty-state">
          <h1>Sign in before checkout</h1>
          <p>Your cart is saved. Taking you to the secure account step…</p>
          <Link className="button primary" href="/account?returnTo=checkout">Continue to account</Link>
        </section>
      </AppShell>
    );
  return (
    <AppShell>
      <ShoppingSteps current="checkout" />
      <section className="checkout-head">
        <Link href="/cart">
          <ArrowLeft /> Back to cart
        </Link>
        <div>
          <p className="eyebrow">WOW RIGHT checkout</p>
          <h1>Complete your order</h1>
          <p>
            Your contact, delivery address and payment choice. Everything is
            checked before your order is saved.
          </p>
        </div>
      </section>
      <form ref={formRef} className="checkout-layout" onSubmit={submit}>
        <div className="checkout-fields">
          <section className="form-card">
            <div className="form-section-title">
              <UserRound />
              <div>
                <span>01</span>
                <h2>Contact</h2>
              </div>
            </div>
            <div className="field-grid">
              <label className="wide">
                Full name
                <input name="name" required autoComplete="name" defaultValue={account?.name} />
              </label>
              <label>
                Mobile number
                <input
                  name="mobile"
                  required
                  inputMode="tel"
                  placeholder="10-digit Indian mobile"
                  autoComplete="tel"
                  defaultValue={account?.mobile.replace(/^91/, '')}
                />
              </label>
              <label>
                Email <small>optional</small>
                <input name="email" type="email" autoComplete="email" defaultValue={account?.email || ''} />
              </label>
            </div>
          </section>
          <section className="form-card">
            <div className="form-section-title">
              <MapPin />
              <div>
                <span>02</span>
                <h2>Delivery</h2>
              </div>
            </div>
            <div className="field-grid">
              {addresses.length > 0 && (
                <div className="saved-address-choices wide" role="radiogroup" aria-label="Saved delivery addresses">
                  <h3>Choose a saved address</h3>
                  {addresses.map((address) => (
                    <button type="button" role="radio" aria-checked={selectedAddressId === String(address.id)} className={selectedAddressId === String(address.id) ? 'selected' : ''} key={String(address.id)} onClick={() => applyAddress(String(address.id))}>
                      <b>{String(address.label || 'Delivery address')}</b>
                      <span>{String(address.line1)}, {String(address.locality)} {String(address.pin_code)}</span>
                    </button>
                  ))}
                  <button type="button" role="radio" aria-checked={!selectedAddressId} className={!selectedAddressId ? 'selected' : ''} onClick={() => { setSelectedAddressId(''); setAddressLabelType(''); formRef.current?.reset(); }}>
                    <b>Use a new address</b><span>Enter or detect another delivery location</span>
                  </button>
                </div>
              )}
              <label className="wide">
                Address line 1
                <input name="line1" required autoComplete="address-line1" />
              </label>
              <label className="wide">
                Address line 2 <small>optional</small>
                <input name="line2" autoComplete="address-line2" />
              </label>
              <label>
                Locality
                <input name="locality" required placeholder="e.g. JP Nagar" />
              </label>
              <label>
                City
                <input
                  name="city"
                  required
                  defaultValue="Bengaluru"
                  autoComplete="address-level2"
                />
              </label>
              <label>
                State
                <select name="state" defaultValue="Karnataka">
                  {states.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                PIN code
                <input
                  name="pinCode"
                  required
                  inputMode="numeric"
                  pattern="[1-9][0-9]{5}"
                  autoComplete="postal-code"
                />
              </label>
              <label className="wide">
                Landmark <small>optional</small>
                <input name="landmark" />
              </label>
              <label className="wide">
                Delivery notes <small>optional</small>
                <textarea name="notes" />
              </label>
            </div>
          </section>
          <section className="form-card">
            <div className="form-section-title">
              <MapPin />
              <div>
                <span>03</span>
                <h2>Location</h2>
              </div>
            </div>
            <div className="field-grid">
              <AddressLocationPicker key={selectedAddressId || 'new'} initialLatitude={Number(addresses.find((a) => String(a.id) === selectedAddressId)?.latitude) || null} initialLongitude={Number(addresses.find((a) => String(a.id) === selectedAddressId)?.longitude) || null} />
              {!selectedAddressId && (
                <div className="save-address-prompt wide">
                  <AddressLabelSelector value={addressLabelType} onChange={setAddressLabelType} />
                </div>
              )}
            </div>
          </section>
          <section className="form-card">
            <div className="form-section-title">
              <ShieldCheck />
              <div>
                <span>04</span>
                <h2>Payment</h2>
              </div>
            </div>
            <div
              className="payment-methods"
              role="radiogroup"
              aria-label="Payment method"
            >
              {!paymentConfig.codEnabled && !paymentConfig.upiEnabled && (
                <p className="form-error">
                  Online ordering is temporarily unavailable. Your cart remains
                  saved.
                </p>
              )}
              {paymentConfig.codEnabled && (
                <label
                  aria-label="Cash on Delivery"
                  className={paymentMethod === 'COD' ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name="paymentChoice"
                    value="COD"
                    checked={paymentMethod === 'COD'}
                    onChange={() => {
                      setPaymentMethod('COD');
                      trackCommerce('AddPaymentInfo', { paymentMethod: 'COD' });
                    }}
                  />
                  <span>
                    <b>Cash on Delivery</b>
                    <small>
                      Pay when your order arrives. Complete checkout here.
                    </small>
                  </span>
                </label>
              )}
              {paymentConfig.upiEnabled && (
                <label
                  aria-label="UPI"
                  className={paymentMethod === 'UPI' ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name="paymentChoice"
                    value="UPI"
                    checked={paymentMethod === 'UPI'}
                    onChange={() => {
                      setPaymentMethod('UPI');
                      trackCommerce('AddPaymentInfo', { paymentMethod: 'UPI' });
                    }}
                  />
                  <span>
                    <b>UPI</b>
                    <small>
                      Save a pending order, then continue on WhatsApp for
                      payment.
                    </small>
                  </span>
                </label>
              )}
            </div>
          </section>
        </div>
        <aside className="summary-card checkout-summary">
          <p className="eyebrow">05 · Review order</p>
          <h2>Order Summary</h2>
          {store.items.map((i) => (
            <div key={i.id} className="checkout-summary-item">
              <ProductImage src={i.image} alt={i.name} />
              <span>
                {i.name} × {i.quantity}
              </span>
              <b>{formatMoney(i.unitPrice * i.quantity)}</b>
            </div>
          ))}
          <hr />
          <CartIncentive subtotal={totals.subtotal} />
          <div>
            <span>Product subtotal</span>
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
          <div className="summary-total">
            <span>Total</span>
            <b>{formatMoney(totals.total)}</b>
          </div>
          {authenticated && (
            <section className="checkout-estimate" aria-live="polite">
              <h3>Made for your order</h3>
              {currentPreview?.error ? (
                <>
                  <p className="form-error">{currentPreview.error}</p>
                  <Link href="/cart">Review cart</Link>
                  {' · '}
                  <button
                    type="button"
                    className="checkout-assistant-link"
                    onClick={() => setPreviewAttempt((value) => value + 1)}
                  >
                    Check again
                  </button>
                </>
              ) : currentPreview?.totals ? (
                <>
                  <p>
                    {currentPreview.estimatedDeliveryDate
                      ? `Estimated delivery by ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(currentPreview.estimatedDeliveryDate + 'T12:00:00Z'))}.`
                      : 'We’ll confirm the delivery date after reviewing the production schedule.'}
                  </p>
                  <small>
                    {paymentMethod === 'UPI'
                      ? 'The estimate uses current capacity. Your production slot and date are finalized after UPI payment is confirmed.'
                      : 'Based on current production capacity; checked again when your order is saved. No delivery time slot is promised yet.'}
                  </small>
                </>
              ) : (
                <p>Checking current prices and production availability…</p>
              )}
            </section>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="whatsapp-explainer">
            {paymentMethod === 'UPI' ? <MessageCircle /> : <ShieldCheck />}
            <p>
              {paymentMethod === 'UPI'
                ? 'Your details and exact total are saved first. You’ll then continue on WhatsApp to complete UPI payment.'
                : 'Place your Cash on Delivery order here. Once saved, it will appear in My Orders.'}
            </p>
          </div>
          <button
            className="checkout-assistant-link"
            type="button"
            data-assistant-hint
          >
            Need help with checkout? Ask WOW Companion
          </button>
          <button
            className={`button ${paymentMethod === 'UPI' ? 'whatsapp' : 'primary'} full`}
            disabled={
              loading ||
              !authenticated ||
              !currentPreview?.totals ||
              launchTotals(totals.subtotal).missing > 0 ||
              (!paymentConfig.codEnabled && !paymentConfig.upiEnabled)
            }
            type="submit"
          >
            {paymentMethod === 'UPI' ? <MessageCircle /> : <ShieldCheck />}
            {loading
              ? 'Saving your order…'
              : paymentMethod === 'UPI'
                ? 'Continue on WhatsApp for UPI Payment'
                : 'Place Cash on Delivery Order'}
          </button>
          <p className="secure-note">
            <ShieldCheck /> Server-verified pricing. No payment is collected on
            this page. Totals are recalculated before the order is created.
          </p>
        </aside>
      </form>
    </AppShell>
  );
}
