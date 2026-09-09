'use client';
import {
  ArrowRight,
  MessageCircle,
  Send,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/components/store-provider';
import { formatMoney } from '@/lib/services/pricing';
import {
  emitCompanionEvent,
  trackCompanionEvent,
} from '@/lib/companion/events';
import type {
  CompanionResponse,
  ProductRecommendation,
} from '@/lib/companion/types';
import { useCompanion } from './companion-context';
import { CompanionCharacter } from './CompanionCharacter';
type Message = {
  role: 'customer' | 'assistant';
  text: string;
  response?: CompanionResponse;
};
const defaultSuggestions = [
  'Help me choose a product',
  'Can I customize this?',
  'I have my own idea',
  'How long will it take?',
];
function greeting(path: string) {
  if (path.includes('krishna'))
    return 'I can help you choose the size, colour and lighting for this Krishna idol.';
  if (path.includes('name-plate'))
    return 'I can help shape your name plate. What name would you like on it?';
  if (path.includes('custom-print'))
    return 'Tell me what you’re imagining and I’ll help prepare a useful custom request.';
  return 'Tell me what you are looking for and I’ll help you choose or customize it.';
}
function Recommendations({
  products,
  onClick,
}: {
  products: ProductRecommendation[];
  onClick: (p: ProductRecommendation) => void;
}) {
  return (
    <div className="companion-recommendations">
      {products.map((p) => (
        <button key={p.id} onClick={() => onClick(p)}>
          <img src={p.images[0]} alt="" />
          <span>
            <b>{p.name}</b>
            <small>From {formatMoney(p.basePrice)}</small>
          </span>
          <ArrowRight />
        </button>
      ))}
    </div>
  );
}
function ConfirmAdd({
  response,
  onDone,
}: {
  response: Extract<
    NonNullable<CompanionResponse['action']>,
    { type: 'confirm_add_to_cart' }
  >;
  onDone: () => void;
}) {
  const [done, setDone] = useState(false);
  const store = useStore();
  function confirm() {
    if (done) return;
    store.add({
      id: crypto.randomUUID(),
      productId: response.product.id,
      slug: response.product.slug,
      name: response.product.name,
      quantity: response.quantity,
      selections: response.selections,
      unitPrice: response.unitPrice,
      image: response.product.images[0],
    });
    trackCompanionEvent('companion_add_to_cart', store.sessionId, {
      productId: response.product.id,
      unitPrice: response.unitPrice,
    });
    setDone(true);
    onDone();
  }
  return (
    <button className="companion-confirm-add" disabled={done} onClick={confirm}>
      <ShoppingBag />
      {done
        ? 'Added to cart'
        : `Confirm add · ${formatMoney(response.unitPrice * response.quantity)}`}
    </button>
  );
}
export function CompanionChat() {
  const { open, setOpen, context, state, setState } = useCompanion();
  const { items, sessionId } = useStore();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, loading]);
  async function sendText(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;
    if (text === 'Open custom request') {
      setOpen(false);
      router.push('/custom-print');
      return;
    }
    if (text === 'Go to checkout') {
      emitCompanionEvent('CHECKOUT_STARTED', { metadata: { assisted: true } });
      setOpen(false);
      router.push('/checkout');
      return;
    }
    if (text === 'Show my cart') {
      setOpen(false);
      router.push('/cart');
      return;
    }
    setInput('');
    setMsgs((x) => [...x, { role: 'customer', text }]);
    setLoading(true);
    setState('thinking');
    emitCompanionEvent('COMPANION_MESSAGE_SENT', {
      metadata: {
        length: text.length,
        topic: /deliver/i.test(text)
          ? 'delivery'
          : /pay|upi|cod/i.test(text)
            ? 'payment'
            : 'general',
      },
    });
    try {
      const r = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          path: context.path,
          cart: items,
          history: msgs.slice(-20),
          context: {
            currentProduct: context.currentProduct,
            selectedOptions: context.selectedOptions,
            intentStage: context.intentStage,
            campaign: {
              source: context.campaign.source,
              campaign: context.campaign.campaign,
            },
          },
        }),
      });
      const d = (await r.json()) as CompanionResponse;
      setMsgs((x) => [
        ...x,
        { role: 'assistant', text: d.message, response: d },
      ]);
      setState('talking');
    } catch {
      setMsgs((x) => [
        ...x,
        {
          role: 'assistant',
          text: 'The WOW Assistant is currently unavailable. You can continue shopping or contact us on WhatsApp.',
        },
      ]);
      setState('concerned');
    } finally {
      setLoading(false);
      setTimeout(() => setState('listening'), 900);
    }
  }
  async function human() {
    const r = await fetch('/api/whatsapp/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        path: context.path,
        cart: items,
        messages: msgs,
      }),
    });
    const d = (await r.json()) as { url: string };
    emitCompanionEvent('WHATSAPP_OPENED', {
      metadata: { handoff: 'human', conversationId: context.conversationId },
    });
    window.open(d.url, '_blank', 'noopener,noreferrer');
  }
  function chooseProduct(p: ProductRecommendation) {
    emitCompanionEvent('PRODUCT_RECOMMENDATION_CLICKED', {
      productId: p.id,
      metadata: { slug: p.slug },
    });
    trackCompanionEvent('companion_recommendation_click', sessionId, {
      productId: p.id,
    });
    setOpen(false);
    router.push(
      p.slug === 'custom-3d-print' ? '/custom-print' : `/product/${p.slug}`,
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    sendText(input);
  }
  return (
    <>
      <button
        type="button"
        aria-label="Close WOW Companion"
        className={`companion-backdrop${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
      />
      <section
        className={`companion-chat${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="WOW Companion"
      >
        <header>
          <div className="companion-chat-identity">
            <CompanionCharacter state={state} />
            <span>
              <b>WOW Companion</b>
              <small>Here to help you choose and customize</small>
            </span>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close companion">
            <X />
          </button>
        </header>
        <div className="companion-messages">
          <div className="companion-message assistant">
            <Sparkles />
            {greeting(context.path)}
          </div>
          {msgs.length === 0 && (
            <div className="companion-quick-replies">
              {defaultSuggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    emitCompanionEvent('COMPANION_QUICK_REPLY', {
                      metadata: { label: s },
                    });
                    sendText(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`companion-turn ${m.role}`}>
              <div className={`companion-message ${m.role}`}>{m.text}</div>
              {m.response?.action?.type === 'recommendations' && (
                <Recommendations
                  products={m.response.action.products}
                  onClick={chooseProduct}
                />
              )}{' '}
              {m.response?.action?.type === 'confirm_add_to_cart' && (
                <ConfirmAdd
                  response={m.response.action}
                  onDone={() => setState('happy')}
                />
              )}
              {m.role === 'assistant' && m.response?.quickReplies && (
                <div className="companion-quick-replies compact">
                  {m.response.quickReplies.map((s) => (
                    <button key={s} onClick={() => sendText(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div
              className="companion-typing"
              aria-label="WOW Companion is thinking"
            >
              <i />
              <i />
              <i />
            </div>
          )}
          <div ref={endRef} />
        </div>
        <button className="companion-human" onClick={human}>
          <MessageCircle /> Talk to a person on WhatsApp
        </button>
        <form onSubmit={submit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about products or customization…"
            aria-label="Message WOW Companion"
          />
          <button disabled={loading || !input.trim()} aria-label="Send message">
            <Send />
          </button>
        </form>
        <footer>
          <ShoppingBag /> Trusted prices come from the WOW RIGHT catalog.
        </footer>
      </section>
    </>
  );
}
