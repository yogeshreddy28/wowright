'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { trackCommerce } from '@/lib/analytics-client';
type Pixel = (...args: unknown[]) => void;
declare global {
  interface Window {
    fbq?: Pixel;
    _fbq?: Pixel;
  }
}
export function AnalyticsProvider() {
  const path = usePathname(),
    [consent, setConsent] = useState<string | null | undefined>(undefined),
    [pixel, setPixel] = useState('');
  useEffect(() => {
    setConsent(localStorage.getItem('wow_analytics_consent'));
    fetch('/api/analytics/config')
      .then((r) => r.json())
      .then((d: any) => setPixel(d.pixelId || ''))
      .catch(() => {});
    const params = new URLSearchParams(location.search),
      allowed = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'campaign_id',
        'ad_id',
        'adset_id',
        'fbclid',
      ];
    const campaign = Object.fromEntries(
      allowed
        .filter((k) => params.has(k))
        .map((k) => [k, params.get(k)!.slice(0, 200)]),
    );
    if (Object.keys(campaign).length)
      sessionStorage.setItem('wow_campaign', JSON.stringify(campaign));
  }, []);
  useEffect(() => {
    if (!path || path.startsWith('/admin') || path.startsWith('/delivery'))
      return;
    trackCommerce('PageView', {
      device: innerWidth < 768 ? 'mobile' : 'desktop',
      returning: Boolean(localStorage.getItem('wow_visited')),
    });
    localStorage.setItem('wow_visited', 'true');
  }, [path]);
  useEffect(() => {
    if (path?.startsWith('/admin') || path?.startsWith('/delivery')) {
      window.fbq?.('consent', 'revoke');
      return;
    }
    if (
      consent !== 'granted' ||
      !pixel ||
      path?.startsWith('/admin') ||
      path?.startsWith('/delivery')
    )
      return;
    if (!window.fbq) {
      const queue: unknown[][] = [];
      const fn: Pixel & {
        queue?: unknown[][];
        loaded?: boolean;
        version?: string;
        push?: Pixel;
        callMethod?: Pixel;
      } = function (...args) {
        if (fn.callMethod) fn.callMethod(...args);
        else queue.push(args);
      };
      fn.queue = queue;
      fn.loaded = true;
      fn.version = '2.0';
      fn.push = fn;
      window.fbq = fn;
      window._fbq = fn;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
      // Disable automatic form capture and advanced matching. Only explicitly
      // allowlisted commerce events below may be sent, with customer consent.
      window.fbq('set', 'autoConfig', false, pixel);
      window.fbq('init', pixel);
    }
    window.fbq('consent', 'grant');
    const listener = (event: Event) => {
      const d = (event as CustomEvent).detail;
      const standard = [
        'PageView',
        'ViewContent',
        'Search',
        'AddToCart',
        'InitiateCheckout',
        'AddPaymentInfo',
        'Lead',
      ];
      if (standard.includes(d.name)) {
        const value = Number(
          d.metadata?.value ?? d.metadata?.total ?? d.metadata?.price,
        );
        window.fbq?.(
          'track',
          d.name,
          {
            content_ids: d.productId ? [d.productId] : undefined,
            content_type: d.productId ? 'product' : undefined,
            currency: 'INR',
            value: Number.isFinite(value) ? value : undefined,
          },
          { eventID: d.eventId },
        );
        window.__wowAnalyticsQueue = (window.__wowAnalyticsQueue || []).filter(
          (item) => item.eventId !== d.eventId,
        );
      }
    };
    window.addEventListener('wow:analytics', listener);
    for (const detail of window.__wowAnalyticsQueue || [])
      listener(new CustomEvent('wow:analytics', { detail }));
    return () => window.removeEventListener('wow:analytics', listener);
  }, [consent, pixel, path]);
  if (
    consent !== null ||
    path?.startsWith('/admin') ||
    path?.startsWith('/delivery')
  )
    return null;
  function choose(value: string) {
    localStorage.setItem('wow_analytics_consent', value);
    setConsent(value);
    if (value !== 'granted') window.fbq?.('consent', 'revoke');
    if (value !== 'granted') window.__wowAnalyticsQueue = [];
  }
  return (
    <aside className="consent-banner" aria-label="Privacy choices">
      <p>
        Allow optional Meta measurement to help us understand which ads work?
        Essential shopping functions work either way.{' '}
        <Link href="/privacy">Privacy</Link>
      </p>
      <button onClick={() => choose('denied')}>Essential only</button>
      <button onClick={() => choose('granted')}>
        Allow optional measurement
      </button>
    </aside>
  );
}
