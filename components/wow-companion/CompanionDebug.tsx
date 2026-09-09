'use client';
import { useEffect, useState } from 'react';
import type { CompanionTrigger } from '@/lib/companion/types';
import { useCompanion } from './companion-context';
const triggers: CompanionTrigger[] = [
  'FIRST_VISIT',
  'META_AD_ENTRY',
  'PRODUCT_HESITATION',
  'REPEAT_PRODUCT_VIEW',
  'MULTIPLE_VARIANT_CHANGES',
  'CART_ADDED',
  'CART_IDLE',
  'CHECKOUT_ERROR',
  'WHATSAPP_HANDOFF',
  'ORDER_SUCCESS',
];
export function CompanionDebug() {
  const [enabled, setEnabled] = useState(false);
  const { context, state, showTrigger } = useCompanion();
  useEffect(() => {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    setEnabled(
      local &&
        new URLSearchParams(location.search).get('companionDebug') === '1',
    );
  }, []);
  if (!enabled) return null;
  return (
    <aside className="companion-debug">
      <b>Companion debug</b>
      <dl>
        <dt>State</dt>
        <dd>{state}</dd>
        <dt>Trigger/event</dt>
        <dd>{context.behavior.lastEvent || '—'}</dd>
        <dt>Score / stage</dt>
        <dd>
          {context.intentScore} · {context.intentStage}
        </dd>
        <dt>Page</dt>
        <dd>{context.pageType}</dd>
        <dt>Cooldown</dt>
        <dd>
          {context.lastPromptAt
            ? `${Math.max(0, 50 - Math.round((Date.now() - context.lastPromptAt) / 1000))}s`
            : 'ready'}
        </dd>
        <dt>Variant</dt>
        <dd>{context.experimentVariant}</dd>
      </dl>
      <select
        aria-label="Simulate trigger"
        defaultValue=""
        onChange={(e) => {
          if (e.target.value)
            showTrigger(e.target.value as CompanionTrigger, true);
        }}
      >
        <option value="">Simulate…</option>
        {triggers.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </aside>
  );
}
