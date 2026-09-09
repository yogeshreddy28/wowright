'use client';
import { Minus, Plus, ShoppingBag } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, Selection } from '@/lib/domain';
import {
  calculateUnitPrice,
  formatMoney,
  getStartingPrice,
} from '@/lib/services/pricing';
import { emitCompanionEvent } from '@/lib/companion/events';
import { useStore } from './store-provider';
export function ProductConfigurator({ product }: { product: Product }) {
  const initialSelections = useRef<Selection>(
    Object.fromEntries(
      product.options
        .filter((o) => o.values?.length)
        .map((o) => [o.key, o.values![0].value]),
    ),
  );
  const [selections, setSelections] = useState<Selection>(
    initialSelections.current,
  );
  const [quantity, setQuantity] = useState(1);
  const availableVariants = (product.variants || []).filter(
    (variant) => variant.active,
  );
  const [variantId, setVariantId] = useState(
    availableVariants.find((variant) => variant.availability === 'available')
      ?.id || '',
  );
  const [error, setError] = useState('');
  const store = useStore();
  const router = useRouter();
  const purchasable =
    product.availability !== 'temporarily_unavailable' &&
    product.availability !== 'discontinued';
  const price = useMemo(() => {
    try {
      return calculateUnitPrice(product, selections, variantId || undefined)
        .unitPrice;
    } catch {
      return null;
    }
  }, [product, selections, variantId]);
  const selectedVariant = availableVariants.find(
    (variant) => variant.id === variantId,
  );
  const finishReference =
    Object.entries(product.finishReferenceImages || {}).find(([finish]) =>
      Object.values(selections).some((value) => String(value) === finish),
    )?.[1] || selectedVariant?.referenceImage;
  useEffect(() => {
    const viewTimer = setTimeout(() => {
      emitCompanionEvent('PRODUCT_VIEW', {
        productId: product.id,
        metadata: { product, selections: initialSelections.current },
      });
      const key = `wow_view_${product.id}`;
      const visits = Number(sessionStorage.getItem(key) || 0) + 1;
      sessionStorage.setItem(key, String(visits));
      if (visits > 1)
        emitCompanionEvent('PRODUCT_VIEW_REPEAT', {
          productId: product.id,
          metadata: { product },
        });
    }, 0);
    const dwell = setTimeout(
      () =>
        emitCompanionEvent('PRODUCT_VIEW', {
          productId: product.id,
          metadata: { product, dwellSeconds: 30 },
        }),
      30_000,
    );
    return () => {
      clearTimeout(viewTimer);
      clearTimeout(dwell);
    };
  }, [product]);
  useEffect(() => {
    if (price === null) return;
    emitCompanionEvent('PRICE_VIEWED', {
      productId: product.id,
      metadata: { price },
    });
  }, [product.id, price]);
  function update(k: string, v: string | number | boolean) {
    const next = { ...selections, [k]: v };
    setSelections(next);
    setError('');
    emitCompanionEvent('CUSTOMIZATION_CHANGED', {
      productId: product.id,
      metadata: {
        selections: next,
        option: k,
        meaningful: typeof v === 'string' && v.trim().length > 1,
      },
    });
    emitCompanionEvent('VARIANT_SELECTED', {
      productId: product.id,
      metadata: { option: k, value: v },
    });
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'SelectProduct',
        path: `/product/${product.slug}`,
        productId: product.id,
        metadata: { option: k, value: v },
      }),
    }).catch(() => {});
  }
  function add(destination?: '/cart' | '/checkout') {
    try {
      if (!purchasable)
        throw new Error('This product is temporarily unavailable');
      const unitPrice = calculateUnitPrice(
        product,
        selections,
        variantId || undefined,
      ).unitPrice;
      store.add({
        id: crypto.randomUUID(),
        productId: product.id,
        slug: product.slug,
        name: product.name,
        quantity,
        selections,
        unitPrice,
        image: selectedVariant?.exactImage || product.images[0],
        variantId: selectedVariant?.id,
        variantName: selectedVariant?.name,
      });
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'add_to_cart',
          sessionId: store.sessionId,
          productId: product.id,
          path: `/product/${product.slug}`,
        }),
      }).catch(() => {});
      if (destination) router.push(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check your selections');
    }
  }
  return (
    <div className="configurator">
      {availableVariants.length > 0 && (
        <fieldset>
          <legend>
            Finish<sup>*</sup>
          </legend>
          <div className="choice-grid finish-choice-grid">
            {availableVariants.map((variant) => (
              <label
                key={variant.id}
                className={variantId === variant.id ? 'selected' : ''}
              >
                <input
                  type="radio"
                  name="finish"
                  value={variant.id}
                  checked={variantId === variant.id}
                  disabled={variant.availability !== 'available'}
                  onChange={() => setVariantId(variant.id)}
                />
                <span>
                  {variant.swatch && (
                    <i
                      className="finish-swatch"
                      style={{ backgroundColor: variant.swatch }}
                    />
                  )}
                  {variant.name}
                  <small>
                    {variant.availability === 'available'
                      ? formatMoney(
                          variant.sellingPrice ??
                            product.basePrice + variant.priceAdjustment,
                        )
                      : 'Unavailable'}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {product.options.map((o) => (
        <fieldset key={o.id}>
          <legend>
            {o.name}
            {o.required && <sup>*</sup>}
          </legend>
          {o.type === 'radio' && (
            <div className="choice-grid">
              {o.values?.map((v) => (
                <label
                  key={v.id}
                  className={selections[o.key] === v.value ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name={o.key}
                    value={v.value}
                    checked={selections[o.key] === v.value}
                    onChange={() => update(o.key, v.value)}
                  />
                  <span>
                    {v.label}
                    {v.priceAdjustment > 0 && (
                      <small>+{formatMoney(v.priceAdjustment)}</small>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          {o.type === 'select' && (
            <select
              aria-label={o.name}
              aria-required={o.required}
              value={String(selections[o.key] || '')}
              onChange={(e) => update(o.key, e.target.value)}
            >
              {o.values?.map((v) => (
                <option key={v.id} value={v.value}>
                  {v.label}
                  {v.priceAdjustment
                    ? ` (+${formatMoney(v.priceAdjustment)})`
                    : ''}
                </option>
              ))}
            </select>
          )}
          {o.type === 'text' && (
            <input
              aria-label={o.name}
              aria-required={o.required}
              maxLength={1000}
              value={String(selections[o.key] || '')}
              onFocus={() =>
                emitCompanionEvent('CUSTOMIZATION_STARTED', {
                  productId: product.id,
                })
              }
              onChange={(e) => update(o.key, e.target.value)}
              placeholder={o.placeholder}
            />
          )}{' '}
          {o.type === 'textarea' && (
            <textarea
              aria-label={o.name}
              aria-required={o.required}
              maxLength={1000}
              value={String(selections[o.key] || '')}
              onFocus={() =>
                emitCompanionEvent('CUSTOMIZATION_STARTED', {
                  productId: product.id,
                })
              }
              onChange={(e) => update(o.key, e.target.value)}
              placeholder={o.placeholder}
            />
          )}
        </fieldset>
      ))}
      {(finishReference || selectedVariant?.exactImage) && (
        <figure className="finish-reference">
          <img
            src={selectedVariant?.exactImage || finishReference}
            alt={
              selectedVariant?.exactImage
                ? `${selectedVariant.name} product view`
                : 'Selected finish reference sample'
            }
          />
          <figcaption>
            {selectedVariant?.exactImage ? (
              <b>{selectedVariant.name}</b>
            ) : (
              <>
                <b>Finish reference</b>Finish reference only. Actual appearance
                may vary slightly depending on the model.
              </>
            )}
          </figcaption>
        </figure>
      )}
      <div className="quantity-row">
        <span>Quantity</span>
        <div>
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label="Decrease quantity"
          >
            <Minus />
          </button>
          <b>{quantity}</b>
          <button
            onClick={() => setQuantity(Math.min(99, quantity + 1))}
            disabled={quantity >= 99}
            aria-label="Increase quantity"
          >
            <Plus />
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {!purchasable && (
        <p className="form-error">This product is temporarily unavailable.</p>
      )}
      {purchasable && price === null && (
        <p className="price-note">
          Complete the required options to see your final total.
        </p>
      )}
      <div className="purchase-row">
        <div>
          <small>{price === null ? 'Starting from' : 'Total'}</small>
          <strong>
            {formatMoney((price ?? getStartingPrice(product)) * quantity)}
          </strong>
        </div>
        <button
          className="button primary"
          onClick={() => add('/cart')}
          disabled={!purchasable}
        >
          <ShoppingBag /> Add to cart
        </button>
      </div>
      <button
        className="button secondary full"
        disabled={!purchasable}
        onClick={() => add('/checkout')}
      >
        Buy Now
      </button>
      <button
        className="text-action"
        disabled={!purchasable}
        onClick={() => add()}
      >
        Add and keep shopping
      </button>
    </div>
  );
}
