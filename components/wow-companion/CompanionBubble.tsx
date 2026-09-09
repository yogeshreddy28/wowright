'use client';
import { X } from 'lucide-react';
export function CompanionBubble({
  message,
  onOpen,
  onDismiss,
}: {
  message: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="companion-proactive" role="status">
      <button className="companion-prompt-copy" onClick={onOpen}>
        {message}
        <span>Ask WOW Companion →</span>
      </button>
      <button
        className="companion-prompt-close"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
      >
        <X />
      </button>
    </div>
  );
}
