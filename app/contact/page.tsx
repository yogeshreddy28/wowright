import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import { createWhatsAppInterestURL } from '@/lib/services/whatsapp';
export default function Contact() {
  const whatsappURL = createWhatsAppInterestURL();
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
          <a href={whatsappURL} target="_blank" rel="noreferrer">
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
          <a href={whatsappURL} target="_blank" rel="noreferrer">
            <Sparkles />
            <b>Product help</b>
            <span>Ask about finishes or customization</span>
            <small>Personal help on WhatsApp</small>
          </a>
        </div>
      </section>
    </AppShell>
  );
}
