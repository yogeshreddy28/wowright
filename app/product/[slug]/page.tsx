import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ProductGallery } from '@/components/product-gallery';
import { ProductCard } from '@/components/product-card';
import { ProductConfigurator } from '@/components/product-configurator';
import { CommerceEvent } from '@/components/commerce-event';
import { ProductReviews } from '@/components/reviews';
import {
  getCatalogProductBySlug,
  getRelatedProducts,
} from '@/lib/catalog-repository';
import { formatMoney, getStartingPrice } from '@/lib/services/pricing';
import { createWhatsAppInterestURL } from '@/lib/services/whatsapp';
import { toProductCardData } from '@/lib/product-card-data';
import {
  Clock,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getCatalogProductBySlug(slug);
  if (!product) return { title: 'Product unavailable' };
  return {
    title: product.name,
    description: product.shortDescription,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: `${product.name} · WOW RIGHT`,
      description: product.shortDescription,
      images: product.images.slice(0, 1),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} · WOW RIGHT`,
      description: product.shortDescription,
      images: product.images.slice(0, 1),
    },
  };
}
export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getCatalogProductBySlug(slug);
  if (!product) notFound();
  const custom =
    product.stockMode === 'quote_only' ||
    product.productType === 'customizable';
  const related = await getRelatedProducts(product);
  const startingPrice = getStartingPrice(product);
  const productURL = new URL(
    `/product/${product.slug}`,
    process.env.SITE_URL || 'https://wowright.in',
  ).toString();
  const whatsappURL = createWhatsAppInterestURL({
    productName: product.name,
    productURL,
  });
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.images,
    brand: { '@type': 'Brand', name: 'WOW RIGHT' },
    offers: custom
      ? undefined
      : {
          '@type': 'Offer',
          priceCurrency: 'INR',
          price: startingPrice,
          availability:
            product.availability === 'available'
              ? 'https://schema.org/PreOrder'
              : 'https://schema.org/OutOfStock',
          url: `/product/${product.slug}`,
        },
  };
  return (
    <AppShell
      whatsappContext={{ productName: product.name, productURL }}
      hideFloatingWhatsApp
    >
      <CommerceEvent
        name="ViewContent"
        path={`/product/${product.slug}`}
        productId={product.id}
        metadata={{ price: startingPrice }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replaceAll('<', '\\u003c'),
        }}
      />
      <nav className="ux-product-breadcrumb" aria-label="Product navigation">
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>
      <section className="product-detail">
        <ProductGallery
          images={product.images}
          name={product.name}
          productId={product.id}
          variants={product.variants}
        />
        <div className="product-info">
          <p className="eyebrow">
            <Sparkles /> {product.category} ·{' '}
            {product.madeToOrderNotice || 'Made to order'}
          </p>
          <h1>{product.name}</h1>
          <p className="product-short">{product.shortDescription}</p>
          <div className="price-line">
            <strong>
              {custom
                ? 'Custom-made for you — request a quote'
                : `From ${formatMoney(startingPrice)}`}
            </strong>
            {!custom &&
              !product.variants?.length &&
              product.compareAtPrice &&
              product.compareAtPrice > startingPrice && (
                <>
                  <del>{formatMoney(product.compareAtPrice)}</del>
                  <span>
                    Save {formatMoney(product.compareAtPrice - startingPrice)}
                  </span>
                </>
              )}
          </div>
          <p className="price-note">
            {custom
              ? 'Final specifications and price are agreed before payment. Custom orders require 100% prepaid UPI.'
              : 'Choose your options below to see your total.'}
          </p>
          {custom ? (
            <Link
              className="button primary full"
              href={`/custom-print?product=${encodeURIComponent(product.id)}`}
            >
              Request a custom quote
            </Link>
          ) : (
            <ProductConfigurator product={product} whatsappURL={whatsappURL} />
          )}
          <a
            className="assistant-inline"
            href={whatsappURL}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle /> Questions? Talk to WOW RIGHT on WhatsApp
          </a>
          <div className="product-assurances">
            <span>
              <Clock />{' '}
              {product.leadTime
                ? `Production estimate: ${product.leadTime}`
                : 'Made to order · timing confirmed before production'}
            </span>
            <span>
              <MapPin /> Bengaluru-focused delivery
            </span>
            <span>
              <MessageCircle /> WhatsApp support
            </span>
            <span>
              <ShieldCheck /> COD and open-box handover where supported
            </span>
          </div>
        </div>
      </section>
      <section className="product-story">
        <p className="eyebrow">Product details</p>
        <h2>
          Made around
          <br />
          your choices.
        </h2>
        <div>
          <p>{product.description}</p>
          {(product.dimensions ||
            Object.values(product.structuredDimensions || {}).some(
              (value) => typeof value === 'number',
            )) && (
            <p>
              <b>Dimensions:</b>{' '}
              {product.dimensions ||
                [
                  product.structuredDimensions?.width,
                  product.structuredDimensions?.depth,
                  product.structuredDimensions?.height,
                ]
                  .filter((value) => value != null)
                  .join(' × ')}{' '}
              {!product.dimensions && product.structuredDimensions?.unit}
            </p>
          )}
          {product.material && (
            <p>
              <b>Material:</b> {product.material}
            </p>
          )}
          {product.deliveryNotes && (
            <p>
              <b>Delivery:</b> {product.deliveryNotes}
            </p>
          )}
          {product.careInstructions && (
            <p>
              <b>Care:</b> {product.careInstructions}
            </p>
          )}
        </div>
      </section>
      {related.length > 0 && (
        <section className="section products-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">You may also like</p>
              <h2>Related products</h2>
            </div>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={toProductCardData(item)}
                density="shop"
                placement="related"
              />
            ))}
          </div>
        </section>
      )}
      <ProductReviews productId={product.id} />
    </AppShell>
  );
}
