'use client';
import { useEffect } from 'react';
import { trackCommerce } from '@/lib/analytics-client';
export function CommerceEvent({
  name,
  path,
  productId,
  metadata,
}: {
  name: 'ViewContent' | 'Search' | 'SelectProduct' | 'InitiateCheckout';
  path: string;
  productId?: string;
  metadata?: Record<string, unknown>;
}) {
  useEffect(() => {
    trackCommerce(name,metadata,productId);
  }, [name, path, productId, metadata]);
  return null;
}
