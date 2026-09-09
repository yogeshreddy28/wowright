'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCompanion } from './companion-context';
import { CompanionCharacter } from './CompanionCharacter';
import { CompanionBubble } from './CompanionBubble';
import { CompanionChat } from './CompanionChat';
import { CompanionDebug } from './CompanionDebug';
import { trackCompanionEvent } from '@/lib/companion/events';
export function WowCompanion() {
  const { open, setOpen, state, prompt, dismissPrompt, context } =
    useCompanion();
  const path = usePathname();
  useEffect(() => {
    const openAssistant = () => setOpen(true);
    const elements = document.querySelectorAll('[data-assistant-hint]');
    elements.forEach((el) => el.addEventListener('click', openAssistant));
    return () =>
      elements.forEach((el) => el.removeEventListener('click', openAssistant));
  }, [path, setOpen]);
  if (path.startsWith('/admin') || state === 'hidden') return null;
  return (
    <div className={`wow-companion-root${open ? ' is-open' : ''}`}>
      <CompanionBubble
        message={prompt}
        onOpen={() => setOpen(true)}
        onDismiss={dismissPrompt}
      />
      <button
        className="companion-launcher"
        onClick={() => setOpen(true)}
        onMouseEnter={() =>
          trackCompanionEvent('companion_hover', context.sessionId, { path })
        }
        aria-label="Open WOW Companion"
      >
        <CompanionCharacter state={state} />
        <span>
          <b>Need help choosing?</b>
          <small>Ask WOW Companion</small>
        </span>
      </button>
      <CompanionChat />
      <CompanionDebug />
    </div>
  );
}
