import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import type { Product } from '@/lib/domain';
import { formatMoney, getStartingPrice } from '@/lib/services/pricing';
import { ProductImage } from './product-image';
export function ProductCard({ product }: { product: Product }) {
  const quote = product.stockMode === 'quote_only' || product.productType === 'customizable';
  const startingPrice = getStartingPrice(product);
  const href = `/product/${product.slug}`;
  return (
    <article className="catalog-card">
      <Link className="catalog-image" href={href}>
        <ProductImage src={product.images[0]} alt={product.name} />
        <span className="customizable">
          <Sparkles /> {quote ? 'Made from your idea' : 'Customizable'}
        </span>
      </Link>
      <div className="catalog-copy">
        <p>{product.category}</p>
        <h3>
          <Link href={href}>{product.name}</Link>
        </h3>
        <span className="card-description">{product.shortDescription}</span>
        <div>
          <strong>
            {!quote && startingPrice
              ? `From ${formatMoney(startingPrice)}`
              : 'Custom quote'}
          </strong>
          <Link className="card-action" href={href}>
            {quote ? 'Start a request' : 'Customize'} <ArrowRight />
          </Link>
        </div>
      </div>
    </article>
  );
}
