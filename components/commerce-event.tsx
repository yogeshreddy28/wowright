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
  const metadataJson = JSON.stringify(metadata || {});
  useEffect(() => {
    trackCommerce(
      name,
      JSON.parse(metadataJson) as Record<string, unknown>,
      productId,
    );
  }, [name, path, productId, metadataJson]);
  return null;
}
