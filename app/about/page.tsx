import { AppShell } from '@/components/app-shell';
import { Heart, Layers3, Sparkles } from 'lucide-react';
export default function About() {
  return (
    <AppShell>
      <section className="about-hero">
        <div>
          <p className="eyebrow">About WOW RIGHT</p>
          <h1>
            More personal than
            <br />
            <em>mass produced.</em>
          </h1>
          <p>
            WOW RIGHT makes personalized and custom 3D printed products for
            people who want something a little more personal than mass-produced
            products.
          </p>
          <div className="about-values">
            <span>
              <Heart /> Personal by design
            </span>
            <span>
              <Layers3 /> Made to order
            </span>
            <span>
              <Sparkles /> Ideas welcome
            </span>
          </div>
        </div>
        <img
          src="/demo-products/hero-studio.webp"
          alt="WOW RIGHT personalized product collection"
        />
      </section>
      <section className="about-copy">
        <p>
          From decorative pieces and name plates to completely custom ideas, we
          combine digital design with 3D printing to make physical products
          around you.
        </p>
        <p>
          Choose a product and shape its details, or start with your own photo,
          sketch, model or description. Every order is saved before WhatsApp
          confirmation, so the process stays clear from selection to production.
        </p>
      </section>
    </AppShell>
  );
}
