'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingSteps, StatusChip, EmptyWork } from './workflow-ui';
import { AppShell } from './app-shell';
import { formatMoney } from '@/lib/services/pricing';
import { AddressLocationPicker } from './address-location-picker';
import { ReviewForm } from './reviews';
import { ProductImage } from './product-image';
import { nextReviewPrompt, type ReviewPromptItem } from '@/lib/services/review-eligibility';
import { AddressLabelSelector } from './address-label-selector';

type Customer = { id: string; name: string; mobile: string; email?: string };
type Address = {
  id: string;
  label?: string;
  line1: string;
  locality: string;
  city: string;
  pin_code: string;
  is_default: number;
  line2?: string;
  state: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
};
type Order = {
  order_number: string;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
};
type ReviewItem = ReviewPromptItem;
export function AccountView() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewPrompt, setReviewPrompt] = useState<ReviewItem | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [checkout, setCheckout] = useState(false),
    [editingAddress, setEditingAddress] = useState<Address | null>(null),
    [addressLabelType, setAddressLabelType] = useState('');
  useEffect(() => {
    setCheckout(
      new URLSearchParams(window.location.search).get('returnTo') ===
        'checkout',
    );
  }, []);
  const load = useCallback(async () => {
    const account = await fetch('/api/account');
    if (!account.ok) {
      setCustomer(null);
      setLoading(false);
      return;
    }
    setCustomer(((await account.json()) as { customer: Customer }).customer);
    const [a, o] = await Promise.all([
      fetch('/api/account/addresses'),
      fetch('/api/account/orders'),
    ]);
    if (a.ok)
      setAddresses(((await a.json()) as { addresses: Address[] }).addresses);
    if (o.ok) {
      const body = await o.json() as { orders: Order[]; reviewItems?: ReviewItem[] };
      setOrders(body.orders); setReviewItems(body.reviewItems || []);
      setReviewPrompt(nextReviewPrompt(body.reviewItems || [], (itemId) => Number(localStorage.getItem(`wow_review_dismissed_${itemId}`) || 0)));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load().catch(() => {
      setError('Could not load your account. Please refresh and try again.');
      setLoading(false);
    });
  }, [load]);
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (busy) return;
    setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch(`/api/account/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error || 'Please check your details.');
        return;
      }
      setLoading(true);
      if (
        new URLSearchParams(window.location.search).get('returnTo') ===
        'checkout'
      ) {
        window.location.assign('/checkout');
        return;
      }
      await load();
    } catch {
      setError('Could not sign in. Check your connection and try again.');
      setLoading(false);
    } finally {
      setBusy(false);
    }
  }
  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (busy) return;
    setBusy(true);
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try {
      const response = await fetch('/api/account/addresses', {
        method: editingAddress ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          id: editingAddress?.id,
          isDefault: values.isDefault === 'on',
        }),
      });
      if (!response.ok) {
        setError('Please check the address.');
        return;
      }
      form.reset();
      setEditingAddress(null);
      setAddressLabelType('');
      setNotice(editingAddress ? 'Address updated.' : 'Address saved. You can choose it at checkout.');
      await load();
    } catch {
      setError('Address was not saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <AppShell>
        <section className="empty-state">
          <p>Loading your account…</p>
        </section>
      </AppShell>
    );
  if (!customer)
    return (
      <AppShell>
        {checkout && <ShoppingSteps current="account" />}
        <section className="account-auth">
          <div>
            <p className="eyebrow">WOW RIGHT account</p>
            <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p>
              {checkout
                ? 'Your cart is saved. Sign in or create an account, then continue straight to checkout.'
                : 'Track your orders, reuse addresses and find your next personal creation.'}
            </p>
          </div>
          <form className="form-card account-auth-card" onSubmit={authenticate}>
            <div className="auth-choice" role="tablist" aria-label="Choose account action">
              <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>
                <b>New here?</b><span>Create account</span>
              </button>
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>
                <b>Already registered?</b><span>Log in</span>
              </button>
            </div>
            {mode === 'register' && (
              <>
                <label>
                  Full name
                  <input name="name" required autoComplete="name" />
                </label>
                <label>
                  Email <small>optional</small>
                  <input name="email" type="email" autoComplete="email" />
                </label>
              </>
            )}
            <label>
              Mobile number
              <input name="phone" required inputMode="tel" autoComplete="tel" />
            </label>
            <label>
              Password
              <input
                name="password"
                required
                type="password"
                minLength={mode === 'register' ? 10 : 1}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
              />
              {mode === 'register' && <small>Use at least 10 characters.</small>}
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="button primary full" disabled={busy}>
              {busy
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>
        </section>
      </AppShell>
    );
  return (
    <AppShell>
      <section className="account-page">
        {reviewPrompt && <div className="review-prompt-backdrop"><section className="review-prompt" role="dialog" aria-modal="true" aria-labelledby="review-prompt-title"><ProductImage src={reviewPrompt.image} alt={reviewPrompt.product_name} /><p className="eyebrow">Verified purchase</p><h2 id="review-prompt-title">How was your order?</h2><p>{reviewPrompt.product_name} · {reviewPrompt.order_number}</p><ReviewForm itemId={reviewPrompt.item_id} open onSubmitted={() => { setReviewPrompt(null); void load(); }} /><button type="button" className="button secondary" onClick={() => { localStorage.setItem(`wow_review_dismissed_${reviewPrompt.item_id}`, String(Date.now())); setReviewPrompt(null); }}>Not now</button></section></div>}
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your WOW RIGHT account</p>
            <h1>Hello, {customer.name}</h1>
            <Link href="/account/quotes">Custom requests & quote approval</Link>
            <p>
              {customer.mobile}
              {customer.email ? ` · ${customer.email}` : ''}
            </p>
          </div>
          <button
            className="button secondary"
            onClick={async () => {
              await fetch('/api/account/logout', { method: 'POST' });
              location.reload();
            }}
          >
            Sign out
          </button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="form-success">
            {notice}
          </p>
        )}
        {checkout && (
          <Link className="button primary" href="/checkout">
            Continue to checkout →
          </Link>
        )}
        <div className="account-grid">
          <section className="form-card">
            <h2>My Orders</h2>
            {reviewItems.length > 0 && <div className="review-reminder"><b>{reviewItems.length === 1 ? 'One product is ready for your review' : `${reviewItems.length} products are ready for review`}</b><span>Only delivered purchases can be reviewed.</span><button type="button" onClick={() => setReviewPrompt(reviewItems[0])}>Write a review</button></div>}
            {orders.length ? (
              [...orders]
                .sort(
                  (a, b) =>
                    Number(['delivered', 'cancelled'].includes(a.status)) -
                    Number(['delivered', 'cancelled'].includes(b.status)),
                )
                .map((order) => (
                  <Link
                    className="account-order"
                    href={`/order/${order.order_number}`}
                    key={order.order_number}
                  >
                    <div>
                      <b>{order.order_number}</b>
                      <span>
                        {new Date(order.created_at).toLocaleDateString('en-IN')}{' '}
                        · <StatusChip status={order.status} />
                      </span>
                    </div>
                    <strong>{formatMoney(order.total)}</strong>
                  </Link>
                ))
            ) : (
              <EmptyWork
                title="Your first order starts here"
                description="Choose something you love. Track its progress here once ordered."
                href="/shop"
                action="Explore products"
              />
            )}
          </section>
          <section className="form-card">
            <h2>Saved addresses</h2>
            {addresses.map((address) => (
              <div className="saved-address" key={address.id}>
                <b>
                  {address.label || 'Delivery address'}
                  {address.is_default ? ' · Default' : ''}
                </b>
                <p>
                  {address.line1}, {address.locality}, {address.city}{' '}
                  {address.pin_code}
                </p>
                <div className="saved-address-actions">
                <button type="button" onClick={() => { setEditingAddress(address); setAddressLabelType(['Home','Work','Friend / Family'].includes(address.label || '') ? address.label! : 'Custom'); }}>Edit / rename</button>
                <button
                  type="button"
                  onClick={async () => {
                    if (busy) return;
                    setBusy(true);
                    setError('');
                    try {
                      const response = await fetch(
                        `/api/account/addresses?id=${address.id}`,
                        { method: 'DELETE' },
                      );
                      const body = (await response.json()) as {
                        error?: string;
                      };
                      if (!response.ok)
                        throw Error(body.error || 'Could not remove address.');
                      await load();
                      setNotice('Address removed.');
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not remove address.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove
                </button>
                </div>
              </div>
            ))}
            <details open={Boolean(editingAddress)}>
              <summary>{editingAddress ? `Edit ${editingAddress.label || 'address'}` : 'Add an address'}</summary>
              <form key={editingAddress?.id || 'new'} className="address-form" onSubmit={saveAddress}>
                <AddressLabelSelector
                  value={addressLabelType}
                  onChange={setAddressLabelType}
                  customDefaultValue={editingAddress && !['Home','Work','Friend / Family'].includes(editingAddress.label || '') ? editingAddress.label : ''}
                />
                <AddressLocationPicker initialLatitude={editingAddress?.latitude} initialLongitude={editingAddress?.longitude} />
                <label>
                  Address
                  <input name="line1" required defaultValue={editingAddress?.line1} />
                </label>
                <label>
                  Address line 2<input name="line2" defaultValue={editingAddress?.line2} />
                </label>
                <label>
                  Area
                  <input name="locality" required defaultValue={editingAddress?.locality} />
                </label>
                <label>
                  City
                  <input name="city" required defaultValue={editingAddress?.city || 'Bengaluru'} />
                </label>
                <label>
                  State
                  <input name="state" required defaultValue={editingAddress?.state || 'Karnataka'} />
                </label>
                <label>
                  Pincode
                  <input name="pinCode" required pattern="[1-9][0-9]{5}" defaultValue={editingAddress?.pin_code} />
                </label>
                <label>
                  Landmark
                  <input name="landmark" defaultValue={editingAddress?.landmark} />
                </label>
                <label className="checkbox-line">
                  <input name="isDefault" type="checkbox" defaultChecked={Boolean(editingAddress?.is_default)} /> Use as default
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? 'Saving…' : editingAddress ? 'Update address' : 'Save address'}
                </button>
                {editingAddress && <button type="button" className="button secondary" onClick={() => { setEditingAddress(null); setAddressLabelType(''); }}>Cancel</button>}
              </form>
            </details>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
