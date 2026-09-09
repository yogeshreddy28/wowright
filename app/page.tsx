import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Factory,
  Lightbulb,
  MapPin,
  PackageCheck,
  SlidersHorizontal,
  Sparkles,
  Truck,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { ProductCard } from '@/components/product-card';
import { faqs } from '@/lib/catalog';
import {
  getBestSellingProducts,
  getCatalogCategories,
  getCatalogProducts,
} from '@/lib/catalog-repository';
export default async function Home() {
  const [products, categories, bestSellers] = await Promise.all([
    getCatalogProducts(),
    getCatalogCategories(),
    getBestSellingProducts(),
  ]);
  const featured = products.filter((product) => product.featured).slice(0, 4);
  const featuredProducts = featured.length ? featured : products.slice(0, 4);
  return (
    <AppShell>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles /> Personalized objects, made for you
          </p>
          <h1>
            Ideas,
            <br />
            <em>Made Real.</em>
          </h1>
          <p className="hero-lede">
            Personalized 3D printed products made to turn your ideas, memories
            and imagination into something you can hold.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/shop">
              Shop Products <ArrowRight />
            </Link>
            <Link className="button secondary" href="/custom-print">
              Create Something Custom
            </Link>
          </div>
          <p className="hero-trust">
            <MapPin /> Made with care in Bangalore <i /> Personalized for you
          </p>
        </div>
        <div className="hero-visual">
          <img
            src="/demo-products/hero-studio.webp"
            alt="A curated collection of warm, modern product forms"
            fetchPriority="high"
          />
        </div>
      </section>
      <section className="section products-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Personal by design</p>
            <h2>Made for You</h2>
            <p>Choose something you love, then make it yours.</p>
          </div>
          <Link href="/shop">
            View all products <ArrowRight />
          </Link>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      </section>
      <section className="custom-banner">
        <div className="custom-banner-visual">
          <img
            src="/demo-products/custom-workflow-wide.webp"
            alt="A concept becoming a digital model and physical object"
            loading="lazy"
          />
        </div>
        <div className="custom-banner-copy">
          <p className="eyebrow">Made from your imagination</p>
          <h2>
            You imagine it.
            <br />
            <em>We make it.</em>
          </h2>
          <p>
            Have a photo, sketch, model or just an idea? Tell us what you want
            and we’ll help turn it into a custom 3D printed product.
          </p>
          <Link className="button light" href="/custom-print">
            Create Something Custom <ArrowRight />
          </Link>
        </div>
      </section>
      <div className="ux-store-trust" aria-label="Shopping with WOW RIGHT">
        <span><PackageCheck />Made to order</span>
        <span><CheckCircle2 />Cash on Delivery</span>
        <span><MapPin />Bengaluru delivery</span>
      </div>
      <section className="section category-section">
        <div className="section-heading"><div><p className="eyebrow">Browse your way</p><h2>Shop by category</h2></div></div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link key={category.id} href={`/category/${category.slug}`}>
              <span>{category.productCount ? `${category.productCount} ${category.productCount === 1 ? 'product' : 'products'}` : 'Collection coming soon'}</span>
              <h3>{category.name}</h3><p>{category.description || 'Explore available made-to-order products.'}</p><ArrowRight />
            </Link>
          ))}
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="how-heading"><p className="eyebrow">Simple from the start</p><h2>From your choice<br />to your doorstep.</h2></div>
        <div className="steps">
          {[
            [Lightbulb, '01', 'Choose', 'Pick a product or tell us your idea.'],
            [SlidersHorizontal, '02', 'Customize', 'Choose your finish, size and personal details.'],
            [Factory, '03', 'We Make It', 'Production begins after your order is confirmed.'],
            [Truck, '04', 'Delivered', 'Track each real order stage from your account.'],
          ].map(([Icon, number, title, description]) => { const StepIcon = Icon as typeof Lightbulb; return <div className="step" key={String(number)}><span>{String(number)}</span><div className="step-icon"><StepIcon /></div><h3>{String(title)}</h3><p>{String(description)}</p></div>; })}
        </div>
      </section>
      <section className="section products-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recently added</p>
            <h2>New arrivals</h2>
          </div>
        </div>
        <div className="product-grid">
          {products.slice(0, 4).map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      </section>
      <section className="section products-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Based on completed orders</p>
            <h2>Best sellers</h2>
          </div>
        </div>
        {bestSellers.length ? (
          <div className="product-grid">
            {bestSellers.map((product) => (
              <ProductCard product={product} key={product.id} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>
              Best sellers will appear after real delivered-order data is
              available.
            </p>
          </div>
        )}
      </section>
      <section className="faq-section">
        <div>
          <p className="eyebrow">Good to know</p>
          <h2>
            Questions,
            <br />
            answered clearly.
          </h2>
          <p>The WOW Assistant can help with products and checkout.</p>
        </div>
        <div>
          {faqs.map((faq, index) => (
            <details key={faq.q} open={index === 0}>
              <summary>
                {faq.q}
                <span>+</span>
              </summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
