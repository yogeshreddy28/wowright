'use client';
import type { CompanionEvent, CompanionEventName } from './types';

const target = typeof window === 'undefined' ? null : new EventTarget();
export function emitCompanionEvent(
  name: CompanionEventName,
  detail: Omit<CompanionEvent, 'name' | 'at'> = {},
) {
  if (!target) return;
  target.dispatchEvent(
    new CustomEvent('wow-companion', {
      detail: { ...detail, name, at: Date.now() },
    }),
  );
}
export function subscribeCompanionEvents(
  listener: (event: CompanionEvent) => void,
) {
  if (!target) return () => {};
  const handler = (event: Event) =>
    listener((event as CustomEvent<CompanionEvent>).detail);
  target.addEventListener('wow-companion', handler);
  return () => target.removeEventListener('wow-companion', handler);
}
export async function trackCompanionEvent(
  name: string,
  sessionId: string,
  details: Record<string, unknown> = {},
) {
  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        sessionId,
        path: location.pathname,
        metadata: details,
      }),
    });
  } catch {}
}
