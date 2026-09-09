import type { CampaignContext, PageType } from './types';
export function parseCampaign(search: string): CampaignContext {
  const p = new URLSearchParams(search);
  const source = p.get('utm_source') || undefined;
  return {
    source,
    medium: p.get('utm_medium') || undefined,
    campaign: p.get('utm_campaign') || undefined,
    content: p.get('utm_content') || undefined,
    term: p.get('utm_term') || undefined,
    fbclid: p.get('fbclid') || undefined,
    isMeta: Boolean(
      p.get('fbclid') ||
      (source &&
        ['facebook', 'instagram', 'meta', 'fb', 'ig'].includes(
          source.toLowerCase(),
        )),
    ),
  };
}
export function pageTypeFromPath(path: string): PageType {
  if (path === '/') return 'home';
  if (path === '/shop') return 'shop';
  if (path.startsWith('/product/')) return 'product';
  if (path.startsWith('/custom-print')) return 'custom';
  if (path === '/cart') return 'cart';
  if (path === '/checkout') return 'checkout';
  if (path.startsWith('/order-success/')) return 'order_success';
  if (path.startsWith('/order/')) return 'order';
  if (path.startsWith('/admin')) return 'admin';
  return 'content';
}
