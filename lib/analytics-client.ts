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
  let consent = false;
  try {
    consent =
      window.localStorage?.getItem('wow_analytics_consent') === 'granted';
  } catch {}
  const eventId = crypto.randomUUID(),
    path = window.location.pathname;
  let campaign: Record<string, string> = {};
  try {
    campaign = JSON.parse(
      window.sessionStorage?.getItem('wow_campaign') || '{}',
    );
  } catch {}
  const detail = {
    name,
    metadata: { ...metadata, ...campaign },
    productId,
    eventId,
    path,
    sessionId: (() => {
      try {
        return window.localStorage?.getItem('mm_session') || undefined;
      } catch {
        return undefined;
      }
    })(),
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
