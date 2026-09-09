import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
export default function Contact() {
  return (
    <AppShell>
      <section className="editorial-page contact-page">
        <p className="eyebrow">Real help when you need it</p>
        <h1>
          Let’s make the next
          <br />
          <em>step easy.</em>
        </h1>
        <p className="contact-lede">
          Ask a quick question, share a custom idea, or continue the
          conversation on WhatsApp.
        </p>
        <div className="contact-cards">
          <a href="https://wa.me/919353193080" target="_blank" rel="noreferrer">
            <MessageCircle />
            <b>WhatsApp</b>
            <span>+91 93531 93080</span>
            <small>Talk directly with WOW RIGHT</small>
          </a>
          <Link href="/custom-print">
            <ArrowRight />
            <b>Custom request</b>
            <span>Share an idea or upload a file</span>
            <small>Private quote request</small>
          </Link>
          <div>
            <Sparkles />
            <b>WOW Assistant</b>
            <span>Open “Need help choosing?”</span>
            <small>Available across the shop</small>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
