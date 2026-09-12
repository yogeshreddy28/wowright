'use client';

import { MessageCircle } from 'lucide-react';
import { createWhatsAppInterestURL } from '@/lib/services/whatsapp';
import { trackCommerce } from '@/lib/analytics-client';

export function WhatsAppHelpLink({
  productName,
  productURL,
  className = '',
  label = 'WhatsApp us',
}: {
  productName?: string;
  productURL?: string;
  className?: string;
  label?: string;
}) {
  const href = createWhatsAppInterestURL({ productName, productURL });
  return (
    <a
      className={`whatsapp-help ${className}`.trim()}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() =>
        trackCommerce('whatsapp_clicked', {
          placement: productName ? 'product' : 'storefront',
        })
      }
      aria-label={productName ? `Ask about ${productName} on WhatsApp` : label}
    >
      <MessageCircle aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}
