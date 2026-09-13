'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { AdminLogin, AdminShell } from './admin-app';
import { AddressLocationPicker } from './address-location-picker';
import { ProductImage } from './product-image';
import { formatMoney } from '@/lib/services/pricing';

type Product = {
  id: string;
  name: string;
  sku?: string;
  base_price: number;
  image?: string;
  product_type: string;
  stock_mode: string;
  lead_time: string;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    selling_price: number | null;
    price_adjustment: number;
  }>;
};
type Line = {
  key: string;
  productId: string;
  variantId: string;
  quantity: number;
  unitPriceOverride: string;
  discount: string;
};
const blankLine = (): Line => ({
  key: crypto.randomUUID(),
  productId: '',
  variantId: '',
  quantity: 1,
  unitPriceOverride: '',
  discount: '0',
});

export function AdminCreateOrderPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    void fetch('/api/admin/orders/assisted')
      .then((r) => setAuthorized(r.status !== 401))
      .catch(() => setAuthorized(false));
  }, []);
  if (authorized === null)
    return <div className="admin-loading">Loading secure order builder…</div>;
  if (!authorized) return <AdminLogin onDone={() => setAuthorized(true)} />;
  return (
    <AdminShell view="orders">
      <AdminCreateOrder />
    </AdminShell>
  );
}

function AdminCreateOrder() {
  const [mobile, setMobile] = useState(''),
    [customer, setCustomer] = useState<any>(null),
    [customerChecked, setCustomerChecked] = useState(false);
  const [products, setProducts] = useState<Product[]>([]),
    [query, setQuery] = useState(''),
    [lines, setLines] = useState<Line[]>([blankLine()]);
  const [savedAddressId, setSavedAddressId] = useState(''),
    [addressKey, setAddressKey] = useState('new');
  const [preview, setPreview] = useState<any>(null),
    [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void fetch('/api/admin/orders/assisted?q=' + encodeURIComponent(query))
          .then((r) => r.json() as Promise<any>)
          .then((body) => setProducts(body.products || [])),
      180,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const selectedAddress = customer?.addresses?.find(
    (address: any) => address.id === savedAddressId,
  );
  const selectedProducts = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  async function findCustomer() {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const response = await fetch(
        '/api/admin/orders/assisted?mobile=' + encodeURIComponent(mobile),
      );
      const body = (await response.json()) as any;
      if (!response.ok) throw Error(body.error);
      setCustomer(body.customer);
      setCustomerChecked(true);
      if (body.customer?.mobile) setMobile(body.customer.mobile);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not search customers.',
      );
    } finally {
      setBusy(false);
    }
  }
  function updateLine(key: string, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setPreview(null);
  }
  function payload(form: HTMLFormElement) {
    const values = Object.fromEntries(new FormData(form));
    return {
      idempotencyKey,
      customer: { mobile, name: values.name, email: values.email || '' },
      address: {
        savedAddressId: savedAddressId || undefined,
        label: values.addressLabel || 'WhatsApp order',
        line1: values.line1,
        line2: values.line2 || '',
        locality: values.locality,
        city: values.city,
        state: values.state,
        pinCode: values.pinCode,
        landmark: values.landmark || '',
        notes: values.notes || '',
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        locationAccuracy: values.locationAccuracy
          ? Number(values.locationAccuracy)
          : undefined,
      },
      items: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId || undefined,
        quantity: Number(line.quantity),
        unitPriceOverride: line.unitPriceOverride
          ? Number(line.unitPriceOverride)
          : undefined,
        discount: Number(line.discount || 0),
      })),
      orderDiscount: Number(values.orderDiscount || 0),
      deliveryOverride:
        values.deliveryOverride === ''
          ? undefined
          : Number(values.deliveryOverride),
      overrideReason: values.overrideReason || undefined,
      paymentMethod: values.paymentMethod,
      upiStatus: values.paymentMethod === 'UPI' ? values.upiStatus : undefined,
      source: values.source,
      attribution: {
        campaignId: values.campaignId || undefined,
        adSetId: values.adSetId || undefined,
        adId: values.adId || undefined,
        notes: values.leadNotes || undefined,
      },
      customerNotes: values.customerNotes || undefined,
    };
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const action = preview ? 'create' : 'preview';
    try {
      const response = await fetch('/api/admin/orders/assisted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, order: payload(event.currentTarget) }),
      });
      const body = (await response.json()) as any;
      if (!response.ok) throw Error(body.error);
      if (action === 'preview') {
        setPreview(body);
        document
          .getElementById('assisted-review')
          ?.scrollIntoView({ behavior: 'smooth' });
      } else setResult(body);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The order could not be created.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <section className="admin-assisted-success">
        <div className="success-mark">
          <Check />
        </div>
        <p className="eyebrow">Order created safely</p>
        <h1>{result.order.order_number} created</h1>
        <p>
          {result.order.status === 'confirmed'
            ? 'This order is confirmed and has entered the normal production queue.'
            : 'The order is saved. UPI payment must be received before confirmation.'}
        </p>
        <dl>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(result.order.total)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>
              {result.order.payment_method === 'COD'
                ? 'Cash on Delivery'
                : result.order.payment_status === 'paid'
                  ? 'UPI received'
                  : 'UPI pending'}
            </dd>
          </div>
          <div>
            <dt>Estimated delivery</dt>
            <dd>
              {result.order.estimatedDeliveryDate || 'Owner review required'}
            </dd>
          </div>
        </dl>
        <div className="admin-assisted-actions">
          <button
            className="button secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(result.whatsappMessage);
              setCopied(true);
            }}
          >
            {copied ? (
              'Copied'
            ) : (
              <>
                <Copy /> Copy WhatsApp confirmation
              </>
            )}
          </button>
          <a
            className="button whatsapp"
            href={result.whatsappUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink /> Open WhatsApp
          </a>
          <Link
            className="button primary"
            href={'/admin/orders/' + result.order.order_number}
          >
            Open order
          </Link>
        </div>
        <p className="secure-link">
          <b>Private tracking link</b>
          <br />
          <a href={result.trackingUrl} target="_blank" rel="noreferrer">
            {result.trackingUrl}
          </a>
        </p>
      </section>
    );

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">WhatsApp / Meta assisted booking</p>
          <h1>Create customer order</h1>
          <p>
            Build the order while you chat. It will enter the same production,
            QC, packing and delivery flow as website checkout.
          </p>
        </div>
        <Link className="button secondary" href="/admin/orders">
          Back to orders
        </Link>
      </header>
      <form
        className="admin-assisted-form"
        onSubmit={submit}
        onChange={() => setPreview(null)}
      >
        <section>
          <div className="admin-assisted-section-title">
            <span>1</span>
            <div>
              <h2>Customer</h2>
              <p>
                Search by normalized Indian mobile before creating anyone new.
              </p>
            </div>
          </div>
          <div className="customer-search">
            <label>
              Mobile number
              <input
                value={mobile}
                onChange={(event) => {
                  setMobile(event.target.value);
                  setCustomerChecked(false);
                  setCustomer(null);
                }}
                required
                placeholder="10-digit mobile or +91…"
              />
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={findCustomer}
              disabled={busy || mobile.length < 10}
            >
              <Search /> Search customer
            </button>
          </div>
          {customerChecked && customer ? (
            <div className="customer-match">
              <UserRound />
              <div>
                <b>Existing customer found: {customer.name}</b>
                <small>
                  {customer.order_count || 0} previous orders ·{' '}
                  {customer.email || 'No email recorded'}
                </small>
              </div>
            </div>
          ) : customerChecked ? (
            <p className="customer-new">
              <Plus /> No customer found. A customer record will be created with
              this order.
            </p>
          ) : null}
          <div className="field-grid">
            <label>
              Full name
              <input
                name="name"
                required
                minLength={2}
                defaultValue={customer?.name || ''}
                key={'name-' + (customer?.id || 'new')}
              />
            </label>
            <label>
              Email <small>optional</small>
              <input
                name="email"
                type="email"
                defaultValue={customer?.email || ''}
                key={'email-' + (customer?.id || 'new')}
              />
            </label>
          </div>
          {customer?.pastOrders?.length > 0 && (
            <details>
              <summary>Recent orders ({customer.pastOrders.length})</summary>
              {customer.pastOrders.map((order: any) => (
                <p key={order.order_number}>
                  <Link href={'/admin/orders/' + order.order_number}>
                    {order.order_number}
                  </Link>{' '}
                  · {formatMoney(order.total)} · {order.status}
                </p>
              ))}
            </details>
          )}
        </section>
        <section>
          <div className="admin-assisted-section-title">
            <span>2</span>
            <div>
              <h2>Delivery address</h2>
              <p>
                Select a saved address or capture the exact Bengaluru delivery
                pin.
              </p>
            </div>
          </div>
          {customer?.addresses?.length > 0 && (
            <div className="saved-address-cards">
              {customer.addresses.map((address: any) => (
                <button
                  type="button"
                  className={savedAddressId === address.id ? 'selected' : ''}
                  key={address.id}
                  disabled={
                    address.latitude == null || address.longitude == null
                  }
                  onClick={() => {
                    setSavedAddressId(address.id);
                    setAddressKey(address.id);
                    setPreview(null);
                  }}
                >
                  <MapPin />
                  <b>{address.label || 'Saved address'}</b>
                  <small>
                    {address.line1}, {address.locality} · {address.pin_code}
                    {address.latitude == null || address.longitude == null
                      ? ' · Add a map pin before reuse'
                      : ''}
                  </small>
                </button>
              ))}
              <button
                type="button"
                className={!savedAddressId ? 'selected' : ''}
                onClick={() => {
                  setSavedAddressId('');
                  setAddressKey('new-' + Date.now());
                }}
              >
                <Plus />
                <b>New address</b>
                <small>Save another delivery location</small>
              </button>
            </div>
          )}
          <div className="field-grid">
            <label>
              Address label
              <input
                name="addressLabel"
                defaultValue={selectedAddress?.label || 'WhatsApp order'}
                disabled={Boolean(savedAddressId)}
              />
            </label>
            <label>
              Full address
              <input
                name="line1"
                required
                defaultValue={selectedAddress?.line1 || ''}
                key={'line1-' + addressKey}
                readOnly={Boolean(savedAddressId)}
              />
            </label>
            <label>
              Address line 2
              <input
                name="line2"
                defaultValue={selectedAddress?.line2 || ''}
                key={'line2-' + addressKey}
                readOnly={Boolean(savedAddressId)}
              />
            </label>
            <label>
              Area / locality
              <input
                name="locality"
                required
                defaultValue={selectedAddress?.locality || ''}
                key={'locality-' + addressKey}
                readOnly={Boolean(savedAddressId)}
              />
            </label>
            <label>
              PIN code
              <input
                name="pinCode"
                required
                pattern="560[0-9]{3}"
                defaultValue={selectedAddress?.pin_code || ''}
                key={'pin-' + addressKey}
                readOnly={Boolean(savedAddressId)}
              />
            </label>
            <label>
              Landmark
              <input
                name="landmark"
                defaultValue={selectedAddress?.landmark || ''}
                key={'landmark-' + addressKey}
                readOnly={Boolean(savedAddressId)}
              />
            </label>
            <input
              type="hidden"
              name="city"
              value={selectedAddress?.city || 'Bengaluru'}
            />
            <input
              type="hidden"
              name="state"
              value={selectedAddress?.state || 'Karnataka'}
            />
            <label className="wide">
              Delivery notes
              <textarea
                name="notes"
                defaultValue={selectedAddress?.notes || ''}
                key={'notes-' + addressKey}
              />
            </label>
          </div>
          <AddressLocationPicker
            key={addressKey}
            initialLatitude={selectedAddress?.latitude}
            initialLongitude={selectedAddress?.longitude}
            initialAccuracy={selectedAddress?.location_accuracy}
          />
        </section>
        <section>
          <div className="admin-assisted-section-title">
            <span>3</span>
            <div>
              <h2>Products</h2>
              <p>
                Prices and finishes load from the live catalogue. Any override
                requires a reason.
              </p>
            </div>
          </div>
          <label className="catalog-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product name or SKU"
            />
          </label>
          <div className="assisted-lines">
            {lines.map((line, index) => {
              const product = selectedProducts.get(line.productId);
              const base = product ? Number(product.base_price) : 0;
              return (
                <article key={line.key}>
                  <span className="line-number">{index + 1}</span>
                  <ProductImage
                    src={product?.image}
                    alt={product?.name || 'Product'}
                  />
                  <div className="line-fields">
                    <label>
                      Product
                      <select
                        required
                        value={line.productId}
                        onChange={(event) => {
                          const next = selectedProducts.get(event.target.value);
                          updateLine(line.key, {
                            productId: event.target.value,
                            variantId:
                              next?.variants.length === 1
                                ? next.variants[0]!.id
                                : '',
                            unitPriceOverride: '',
                          });
                        }}
                      >
                        <option value="">Choose product</option>
                        {products.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {formatMoney(Number(item.base_price))}
                          </option>
                        ))}
                      </select>
                    </label>
                    {product?.variants.length ? (
                      <label>
                        Finish
                        <select
                          required
                          value={line.variantId}
                          onChange={(event) =>
                            updateLine(line.key, {
                              variantId: event.target.value,
                              unitPriceOverride: '',
                            })
                          }
                        >
                          <option value="">Choose finish</option>
                          {product.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                              {variant.name} ·{' '}
                              {formatMoney(
                                variant.selling_price ??
                                  base + Number(variant.price_adjustment || 0),
                              )}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        Finish
                        <input value="Standard" disabled />
                      </label>
                    )}
                    <label>
                      Quantity
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.key, {
                            quantity: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Sale unit price <small>blank = catalogue</small>
                      <input
                        type="number"
                        min="1"
                        value={line.unitPriceOverride}
                        onChange={(event) =>
                          updateLine(line.key, {
                            unitPriceOverride: event.target.value,
                          })
                        }
                        placeholder={product ? String(base) : ''}
                      />
                    </label>
                    <label>
                      Line discount
                      <input
                        type="number"
                        min="0"
                        value={line.discount}
                        onChange={(event) =>
                          updateLine(line.key, { discount: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Remove item"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.key !== line.key),
                        )
                      }
                    >
                      <Trash2 />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <button
            type="button"
            className="button secondary"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus /> Add another product
          </button>
        </section>
        <section>
          <div className="admin-assisted-section-title">
            <span>4</span>
            <div>
              <h2>Payment, totals & source</h2>
              <p>Default launch rules apply. Overrides are audited.</p>
            </div>
          </div>
          <div className="field-grid">
            <label>
              Payment method
              <select name="paymentMethod" defaultValue="COD">
                <option value="COD">Cash on Delivery</option>
                <option value="UPI">UPI / Prepaid</option>
              </select>
            </label>
            <label>
              UPI status
              <select name="upiStatus" defaultValue="payment_pending">
                <option value="payment_pending">Payment pending</option>
                <option value="payment_received">Payment received</option>
              </select>
            </label>
            <label>
              Order source
              <select name="source" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="meta_ad">Meta Ad</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="phone">Phone</option>
                <option value="walk_in">Walk-in</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Order discount
              <input
                name="orderDiscount"
                type="number"
                min="0"
                defaultValue="0"
              />
            </label>
            <label>
              Delivery override <small>blank = normal rule</small>
              <input name="deliveryOverride" type="number" min="0" />
            </label>
            <label>
              Override reason
              <input
                name="overrideReason"
                placeholder="Required for any price/delivery/minimum override"
              />
            </label>
            <label>
              Meta campaign ID
              <input name="campaignId" />
            </label>
            <label>
              Ad set ID
              <input name="adSetId" />
            </label>
            <label>
              Ad ID
              <input name="adId" />
            </label>
            <label className="wide">
              Lead/reference notes
              <textarea name="leadNotes" />
            </label>
            <label className="wide">
              Customer notes
              <textarea name="customerNotes" />
            </label>
          </div>
        </section>
        {error && (
          <p role="alert" className="form-error assisted-error">
            {error}
          </p>
        )}
        {preview && (
          <section id="assisted-review" className="assisted-review">
            <div className="admin-assisted-section-title">
              <span>5</span>
              <div>
                <h2>Review before confirmation</h2>
                <p>Nothing changes until you create the order.</p>
              </div>
            </div>
            <div className="review-grid">
              <div>
                <h3>Customer</h3>
                <p>
                  <b>{preview.customer.name}</b>
                  <br />
                  {preview.customer.mobile}
                  <br />
                  {preview.customer.email || 'Email not supplied'}
                </p>
              </div>
              <div>
                <h3>Payment</h3>
                <p>
                  {preview.paymentMethod} · {preview.paymentStatus}
                  <br />
                  Source: {preview.source.replace('_', ' ')}
                </p>
              </div>
            </div>
            {preview.items.map((item: any) => (
              <div className="review-line" key={item.productId + item.variant}>
                <span>
                  {item.name}
                  <small>
                    {item.variant || 'Standard'} · Qty {item.quantity}
                  </small>
                </span>
                <b>{formatMoney(item.lineTotal)}</b>
              </div>
            ))}
            <dl className="review-totals">
              <div>
                <dt>Product subtotal</dt>
                <dd>{formatMoney(preview.subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>
                  {preview.deliveryAmount
                    ? formatMoney(preview.deliveryAmount)
                    : 'FREE'}
                </dd>
              </div>
              <div>
                <dt>Final total</dt>
                <dd>{formatMoney(preview.total)}</dd>
              </div>
            </dl>
          </section>
        )}
        <div className="admin-assisted-submit">
          <p>
            {preview
              ? 'Review complete. Create this order in the normal fulfillment pipeline.'
              : 'Preview validates products, finishes, totals, payment and Bengaluru delivery.'}
          </p>
          <button className="button primary" disabled={busy}>
            {busy
              ? 'Checking…'
              : preview
                ? 'Create & Confirm Order'
                : 'Review order'}
          </button>
        </div>
      </form>
    </>
  );
}
