'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock3,
  MapPin,
  Minus,
  PackagePlus,
  Plus,
  Route,
  Search,
  Store,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';

type Row = Record<string, any>;
type Location = { latitude: number; longitude: number; accuracy?: number };
type CartLine = {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string;
  image?: string;
  unitPrice: number;
  quantity: number;
};

const noOrderReasons = [
  'Price',
  'Not interested',
  'Different products needed',
  'Ask later',
  'Other',
];

function currentLocation(): Promise<Location> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable on this device.'));
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      () => reject(new Error('Allow location access to check in at a shop.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

export function FieldBookingApp() {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedShop, setSelectedShop] = useState<Row | null>(null);
  const [visit, setVisit] = useState<Row | null>(null);
  const [screen, setScreen] = useState<'shops' | 'catalog' | 'cart' | 'success'>('shops');
  const [filter, setFilter] = useState<'all' | 'models' | 'keychains'>('all');
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Row | null>(null);
  const [draftQuantities, setDraftQuantities] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [booking, setBooking] = useState<Row | null>(null);
  const [showNoOrder, setShowNoOrder] = useState(false);
  const lastSent = useRef(0);

  async function load() {
    const response = await fetch('/api/field');
    if (response.status === 401) return setData({ unauthorized: true });
    const body = (await response.json()) as Row;
    if (!response.ok) throw new Error(body.error || 'Could not load field work.');
    setData(body);
  }

  useEffect(() => {
    load().catch((reason) => setError(reason.message));
  }, []);

  async function send(body: Row) {
    const response = await fetch('/api/field', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as Row;
    if (!response.ok) throw new Error(result.error || 'Update could not be saved.');
    return result;
  }

  async function perform(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!data?.session || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        if (Date.now() - lastSent.current < 90_000) return;
        lastSent.current = Date.now();
        send({
          action: 'track_point',
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          },
          recordedAt: new Date(position.timestamp).toISOString(),
        }).catch(() => setNotice('Route point could not be saved. Tracking will retry.'));
      },
      () => setNotice('Location tracking is active but waiting for GPS permission.'),
      { enableHighAccuracy: false, timeout: 30_000, maximumAge: 60_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [data?.session]);

  const visibleProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return ((data?.products || []) as Row[]).filter(
      (product) =>
        (filter === 'all' || product.kind === filter) &&
        (!needle || product.name.toLowerCase().includes(needle)),
    );
  }, [data?.products, filter, search]);
  const totalPieces = cart.reduce((sum, line) => sum + line.quantity, 0);
  const totalAmount = cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  function openProduct(product: Row) {
    setSelectedProduct(product);
    setDraftQuantities(
      Object.fromEntries(
        product.variants.map((variant: Row) => [variant.id || 'standard', 0]),
      ),
    );
  }

  function addProduct() {
    if (!selectedProduct) return;
    const additions: CartLine[] = selectedProduct.variants
      .filter((variant: Row) => (draftQuantities[variant.id || 'standard'] || 0) > 0)
      .map((variant: Row) => ({
        productId: selectedProduct.id,
        variantId: variant.id,
        productName: selectedProduct.name,
        variantName: variant.name,
        image: variant.image || selectedProduct.image,
        unitPrice: Number(variant.price),
        quantity: draftQuantities[variant.id || 'standard'],
      }));
    setCart((current) => {
      const next = [...current];
      for (const addition of additions) {
        const found = next.findIndex(
          (line) => line.productId === addition.productId && line.variantId === addition.variantId,
        );
        if (found >= 0) next[found] = { ...next[found], quantity: next[found].quantity + addition.quantity };
        else next.push(addition);
      }
      return next;
    });
    setSelectedProduct(null);
    setNotice(`${selectedProduct.name} added to the booking.`);
  }

  if (!data) return <main className="field-app"><p>Loading field workspace…</p></main>;
  if (data.unauthorized)
    return (
      <main className="field-app">
        <form
          className="field-login"
          onSubmit={(event) => {
            event.preventDefault();
            perform(async () => {
              const response = await fetch('/api/delivery/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
              });
              if (!response.ok) throw new Error('Check your mobile number and password.');
              await load();
            });
          }}
        >
          <Link className="brand" href="/">WOW <b>RIGHT</b></Link>
          <Store size={42} />
          <h1>Retail bookings</h1>
          <p>Sign in with your employee delivery login.</p>
          <label>Mobile number<input name="mobile" type="tel" required /></label>
          <label>Password<input name="password" type="password" required /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" disabled={busy}>Sign in</button>
        </form>
      </main>
    );

  return (
    <main className="field-app">
      <header className="field-header">
        <Link className="brand" href="/field">WOW <b>RIGHT</b></Link>
        <div>
          <strong>{data.employee.name}</strong>
          <span className={data.session ? 'tracking-on' : 'tracking-off'}>
            <Route size={15} /> {data.session ? 'Tracking active' : 'Day not started'}
          </span>
        </div>
      </header>
      {error && <p role="alert" className="form-error field-feedback">{error}</p>}
      {notice && <p role="status" className="form-success field-feedback">{notice}</p>}

      {!data.session ? (
        <section className="field-start-card">
          <Clock3 />
          <h1>Start today&apos;s field work</h1>
          <p>Location is recorded only between Start Day and End Day.</p>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() =>
              perform(async () => {
                let location: Location | undefined;
                try { location = await currentLocation(); } catch { setNotice('Day started without an initial GPS point. You can allow location access when checking in.'); }
                await send({ action: 'start_day', location });
                await load();
              })
            }
          >START DAY</button>
        </section>
      ) : screen === 'shops' ? (
        <>
          <section className="field-title-row">
            <div><p className="eyebrow">Today&apos;s visits</p><h1>Choose a shop</h1></div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => perform(async () => {
                let location: Location | undefined;
                try { location = await currentLocation(); } catch {}
                const result = await send({ action: 'end_day', location });
                setNotice(`Day ended · ${(Number(result.distanceMetres || 0) / 1000).toFixed(1)} km recorded`);
                await load();
              })}
            >END DAY</button>
          </section>
          <div className="field-shop-list">
            {(data.shops as Row[]).map((shop) => {
              const active = selectedShop?.id === shop.id;
              return (
                <article className={`field-shop-card${active ? ' selected' : ''}`} key={shop.id}>
                  <button type="button" className="field-shop-main" onClick={() => { setSelectedShop(shop); setVisit(null); setShowNoOrder(false); }}>
                    <Store />
                    <span><strong>{shop.name}</strong><small>{shop.phone}</small><small>{shop.address}{shop.locality ? `, ${shop.locality}` : ''}</small><small>{shop.previous_bookings || 0} previous booking(s)</small></span>
                  </button>
                  {active && (
                    <div className="field-shop-actions">
                      {!visit ? (
                        <button className="button primary full" disabled={busy} onClick={() => perform(async () => {
                          const location = await currentLocation();
                          const result = await send({ action: 'check_in', shopId: shop.id, location });
                          setVisit(result);
                          setNotice(result.distanceMetres == null ? 'Checked in. Shop location is not registered.' : `Check-in: ${Math.round(result.distanceMetres)} m from shop${result.requiresReview ? ' · flagged for review' : ' ✓'}`);
                          await load();
                        })}><MapPin /> CHECK IN</button>
                      ) : (
                        <>
                          <div className={`field-checkin-result${visit.requiresReview ? ' warning' : ''}`}>
                            <Check /> {visit.distanceMetres == null ? 'Checked in' : `${Math.round(visit.distanceMetres)} m from shop`}
                          </div>
                          <button className="button primary" onClick={() => { setScreen('catalog'); setCart([]); }}>NEW BOOKING</button>
                          <button className="button secondary" onClick={() => setShowNoOrder(true)}>NO ORDER</button>
                        </>
                      )}
                      {showNoOrder && (
                        <div className="field-reason-grid">
                          <p>Why was there no order?</p>
                          {noOrderReasons.map((reason) => (
                            <button key={reason} disabled={busy} onClick={() => perform(async () => {
                              await send({ action: 'no_order', visitId: visit!.visitId, reason });
                              setSelectedShop(null); setVisit(null); setShowNoOrder(false); setNotice('No-order visit saved.'); await load();
                            })}>{reason}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
            {!data.shops.length && <div className="empty-state"><h2>No registered shops</h2><p>Ask the owner to register shops in Admin → Field bookings.</p></div>}
          </div>
        </>
      ) : screen === 'catalog' ? (
        <>
          <section className="field-title-row sticky">
            <button className="icon-button" aria-label="Back to shops" onClick={() => setScreen('shops')}><ArrowLeft /></button>
            <div><small>{selectedShop?.name}</small><h1>New booking</h1></div>
            <button className="field-cart-button" onClick={() => setScreen('cart')}><PackagePlus /> {totalPieces}</button>
          </section>
          <div className="field-catalog-tools">
            <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" /></label>
            <div>{(['all', 'models', 'keychains'] as const).map((value) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{value.toUpperCase()}</button>)}</div>
          </div>
          <div className="field-product-grid">
            {visibleProducts.map((product) => (
              <button key={product.id} className="field-product-card" onClick={() => openProduct(product)}>
                <span className="field-product-image">{product.image ? <img src={product.image} alt={product.name} /> : <Store />}</span>
                <strong>{product.name}</strong>
                <span>From {formatMoney(Math.min(...product.variants.map((variant: Row) => Number(variant.price))))}</span>
              </button>
            ))}
          </div>
          {selectedProduct && (
            <div className="field-product-sheet" role="dialog" aria-modal="true" aria-label={`Choose ${selectedProduct.name}`}>
              <div className="field-sheet-card">
                <button className="field-sheet-close" aria-label="Close" onClick={() => setSelectedProduct(null)}>×</button>
                <span className="field-sheet-image">{selectedProduct.image ? <img src={selectedProduct.image} alt={selectedProduct.name} /> : <Store />}</span>
                <h2>{selectedProduct.name}</h2>
                <div className="field-variant-quantities">
                  {selectedProduct.variants.map((variant: Row) => {
                    const key = variant.id || 'standard';
                    const quantity = draftQuantities[key] || 0;
                    return <div key={key}><span><strong>{variant.name}</strong><small>{formatMoney(Number(variant.price))}</small></span><div><button aria-label={`Remove one ${variant.name}`} onClick={() => setDraftQuantities((current) => ({ ...current, [key]: Math.max(0, quantity - 1) }))}><Minus /></button><b>{quantity}</b><button aria-label={`Add one ${variant.name}`} onClick={() => setDraftQuantities((current) => ({ ...current, [key]: quantity + 1 }))}><Plus /></button></div></div>;
                  })}
                </div>
                <div className="field-sheet-total"><span>Total quantity</span><strong>{Object.values(draftQuantities).reduce((sum, value) => sum + value, 0)}</strong></div>
                <button className="button primary full" disabled={!Object.values(draftQuantities).some(Boolean)} onClick={addProduct}>ADD TO BOOKING</button>
              </div>
            </div>
          )}
        </>
      ) : screen === 'cart' ? (
        <section className="field-booking-cart">
          <div className="field-title-row"><button className="icon-button" onClick={() => setScreen('catalog')}><ArrowLeft /></button><div><small>{selectedShop?.name}</small><h1>Review booking</h1></div></div>
          {cart.map((line, index) => (
            <article key={`${line.productId}-${line.variantId}`}>
              <span className="field-cart-image">{line.image ? <img src={line.image} alt="" /> : <Store />}</span>
              <div><strong>{line.productName}</strong><span>{line.variantName} × {line.quantity}</span><small>{formatMoney(line.unitPrice)} each</small></div>
              <strong>{formatMoney(line.unitPrice * line.quantity)}</strong>
              <button aria-label={`Remove ${line.productName} ${line.variantName}`} onClick={() => setCart((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </article>
          ))}
          {!cart.length && <div className="empty-state"><h2>Booking is empty</h2><button className="button secondary" onClick={() => setScreen('catalog')}>Add products</button></div>}
          {!!cart.length && <div className="field-booking-summary"><div><span>TOTAL PIECES</span><strong>{totalPieces}</strong></div><div><span>TOTAL AMOUNT</span><strong>{formatMoney(totalAmount)}</strong></div><p>PAYMENT: <b>PAYABLE ON DELIVERY</b></p><button className="button primary full" disabled={busy} onClick={() => perform(async () => {
            const result = await send({ action: 'confirm_booking', visitId: visit!.visitId, lines: cart.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })) });
            setBooking(result); setScreen('success'); await load();
          })}>CONFIRM BOOKING</button></div>}
        </section>
      ) : (
        <section className="field-success"><Check /><p className="eyebrow">Booking saved</p><h1>{booking!.bookingNumber}</h1><p>{selectedShop?.name}</p><div><span>{booking!.totalQuantity} pieces</span><strong>{formatMoney(booking!.totalAmount)}</strong></div><b>PAYABLE ON DELIVERY</b><button className="button primary full" onClick={() => { setSelectedShop(null); setVisit(null); setCart([]); setBooking(null); setScreen('shops'); }}>NEXT SHOP</button></section>
      )}
    </main>
  );
}
