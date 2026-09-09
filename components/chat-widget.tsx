'use client';
import { MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useStore } from './store-provider';
type Msg = { role: 'customer' | 'assistant'; text: string };
const suggestions = [
  'Help me choose a product',
  'Can I customize this?',
  'I have my own idea',
  'How long will it take?',
];
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const path = usePathname();
  const { items, sessionId } = useStore();
  useEffect(() => {
    const openAssistant = () => setOpen(true);
    document
      .querySelectorAll('[data-assistant-hint]')
      .forEach((el) => el.addEventListener('click', openAssistant));
    return () =>
      document
        .querySelectorAll('[data-assistant-hint]')
        .forEach((el) => el.removeEventListener('click', openAssistant));
  }, [path]);
  const greeting = path.includes('krishna')
    ? 'Hi! I can help you choose the size, colour and lighting option for this Krishna idol.'
    : path.includes('name-plate')
      ? 'I can help you customize your name plate. What name would you like on it?'
      : path.includes('custom-print')
        ? 'Tell me what you’re imagining and I’ll help you prepare a useful custom request.'
        : 'Hi! I’m the WOW Assistant. Tell me what you’re looking for and I’ll help you choose or customize it.';
  async function sendText(text: string) {
    if (!text.trim() || loading) return;
    setInput('');
    setMsgs((x) => [...x, { role: 'customer', text }]);
    setLoading(true);
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          path,
          cart: items,
          history: msgs,
        }),
      });
      const d = (await r.json()) as { message: string };
      setMsgs((x) => [...x, { role: 'assistant', text: d.message }]);
    } catch {
      setMsgs((x) => [
        ...x,
        {
          role: 'assistant',
          text: 'The WOW Assistant is currently unavailable. You can continue shopping or contact us on WhatsApp.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    await sendText(input.trim());
  }
  async function human() {
    const r = await fetch('/api/whatsapp/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, path, cart: items, messages: msgs }),
    });
    const d = (await r.json()) as { url: string };
    window.open(d.url, '_blank', 'noopener,noreferrer');
  }
  return (
    <>
      <button
        className="chat-launcher"
        onClick={() => setOpen(true)}
        aria-label="Open WOW Assistant"
      >
        <span className="assistant-mark">
          <Sparkles />
        </span>
        <span>
          <b>Need help choosing?</b>
          <small>Ask the WOW Assistant</small>
        </span>
      </button>
      <div
        className={`chat-backdrop${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Escape' || e.key === 'Enter') setOpen(false);
        }}
        onClick={() => setOpen(false)}
      />
      <section
        className={`chat-panel${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="WOW Assistant"
      >
        <header>
          <div>
            <span className="assistant-mark">
              <Sparkles />
            </span>
            <span>
              <b>WOW Assistant</b>
              <small>Here to help you choose and customize</small>
            </span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close assistant">
            <X />
          </button>
        </header>
        <div className="chat-messages">
          <div className="chat-bubble assistant">{greeting}</div>
          {msgs.length === 0 && (
            <div className="prompt-chips">
              {suggestions.map((s) => (
                <button key={s} onClick={() => sendText(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.role}`}>
              {m.text}
            </div>
          ))}
          {loading && (
            <div className="typing" aria-label="WOW Assistant is typing">
              <i />
              <i />
              <i />
            </div>
          )}
        </div>
        <button className="human-link" onClick={human}>
          <MessageCircle /> Talk to a person on WhatsApp
        </button>
        <form onSubmit={send}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about products, sizes or delivery…"
            aria-label="Message"
          />
          <button disabled={loading || !input.trim()} aria-label="Send">
            <Send />
          </button>
        </form>
      </section>
    </>
  );
}
