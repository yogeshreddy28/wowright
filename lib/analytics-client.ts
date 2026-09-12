type AnalyticsDetail = {
  name: string;
  metadata: Record<string, unknown>;
  productId?: string;
  eventId: string;
  path: string;
  sessionId?: string;
  consent: boolean;
};

declare global {
  interface Window {
    __wowAnalyticsQueue?: AnalyticsDetail[];
  }
}

export function trackCommerce(
  name: string,
  metadata: Record<string, unknown> = {},
  productId?: string,
) {
  if (typeof window === 'undefined') return;
  const eventId = crypto.randomUUID(),
    path = window.location.pathname,
    consent = localStorage.getItem('wow_analytics_consent') === 'granted';
  let campaign: Record<string, string> = {};
  try {
    campaign = JSON.parse(sessionStorage.getItem('wow_campaign') || '{}');
  } catch {}
  const detail = {
    name,
    metadata: { ...metadata, ...campaign },
    productId,
    eventId,
    path,
    sessionId: localStorage.getItem('mm_session') || undefined,
    consent,
  };
  window.__wowAnalyticsQueue = [
    ...(window.__wowAnalyticsQueue || []).slice(-49),
    detail,
  ];
  fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(detail),
    keepalive: true,
  }).catch(() => {});
  window.dispatchEvent(new CustomEvent('wow:analytics', { detail }));
}
