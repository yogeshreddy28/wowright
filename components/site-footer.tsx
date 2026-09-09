import Link from 'next/link';
import { MessageCircle, Sparkles } from 'lucide-react';
import { BrandLogo } from './brand-logo';
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <BrandLogo inverted />
        <p>Personalized 3D printed products made around you.</p>
        <span>
          <Sparkles /> Made with care in Bangalore
        </span>
      </div>
      <div className="footer-links">
        <div>
          <b>Explore</b>
          <Link href="/shop">Shop</Link>
          <Link href="/custom-print">Custom Print</Link>
          <Link href="/about">About</Link>
        </div>
        <div>
          <b>Help</b>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/policies">Order Policies</Link>
        </div>
        <div>
          <b>Talk to us</b>
          <a href="https://wa.me/919353193080" target="_blank" rel="noreferrer">
            <MessageCircle /> WhatsApp
          </a>
          <span>+91 93531 93080</span>
        </div>
      </div>
      <small>
        © {new Date().getFullYear()} WOW RIGHT. Made personal, made real.
      </small>
    </footer>
  );
}
