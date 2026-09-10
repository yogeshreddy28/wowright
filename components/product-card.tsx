'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles, Star } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Product } from '@/lib/domain';
import { formatMoney, getStartingPrice } from '@/lib/services/pricing';
import { trackCommerce } from '@/lib/analytics-client';
import { ProductImage } from './product-image';

export type ProductCardDensity = 'featured' | 'shop' | 'standard';

export function ProductCard({
  product,
  density = 'standard',
  placement = 'catalogue',
}: {
  product: Product;
  density?: ProductCardDensity;
  placement?:
    | 'homepage_featured'
    | 'shop'
    | 'related'
    | 'category'
    | 'catalogue';
}) {
  const cardRef = useRef<HTMLElement>(null);
  const quote =
    product.stockMode === 'quote_only' ||
    product.productType === 'customizable';
  const startingPrice = getStartingPrice(product);
  const href = `/product/${product.slug}`;
  useEffect(() => {
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        trackCommerce('product_impression', { placement }, product.id);
        observer.disconnect();
      },
      { threshold: 0.55 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [placement, product.id]);
  function trackClick() {
    trackCommerce('product_click', { placement }, product.id);
  }
  return (
    <article
      ref={cardRef}
      className={`catalog-card catalog-card--${density}`}
      data-product-card={density}
    >
      <Link className="catalog-image" href={href} onClick={trackClick}>
        <ProductImage src={product.images[0]} alt={product.name} />
        <span className="customizable">
          <Sparkles /> {quote ? 'Custom quote' : 'Made to order'}
        </span>
      </Link>
      <div className="catalog-copy">
        {density === 'standard' && <p>{product.category}</p>}
        <h3>
          <Link href={href} onClick={trackClick}>
            {product.name}
          </Link>
        </h3>
        {product.reviewCount ? (
          <p
            className="card-rating"
            aria-label={`${product.rating?.toFixed(1)} out of 5 from ${product.reviewCount} verified reviews`}
          >
            <Star aria-hidden="true" />
            <b>{product.rating?.toFixed(1)}</b>
            <span>({product.reviewCount})</span>
          </p>
        ) : null}
        {density === 'standard' && (
          <span className="card-description">{product.shortDescription}</span>
        )}
        <div>
          <strong>
            {!quote && startingPrice
              ? formatMoney(startingPrice)
              : 'Custom quote'}
          </strong>
          <Link className="card-action" href={href} onClick={trackClick}>
            {quote ? 'Request' : 'View'} <ArrowRight />
          </Link>
        </div>
      </div>
    </article>
  );
}
