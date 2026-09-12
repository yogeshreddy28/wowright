'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartItem } from '@/lib/domain';
import { emitCompanionEvent } from '@/lib/companion/events';
import { trackCommerce } from '@/lib/analytics-client';
type Store = {
  items: CartItem[];
  sessionId: string;
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  quantity: (id: string, n: number) => void;
  clear: () => void;
  toast: string;
  notify: (s: string) => void;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState('');
  useEffect(() => {
    let stored: string | null = null;
    let sid: string | null = null;
    try {
      stored = window.localStorage?.getItem('mm_cart') ?? null;
      sid = window.localStorage?.getItem('mm_session') ?? null;
    } catch {}
    if (stored)
      try {
        setItems(JSON.parse(stored));
      } catch {}
    if (!sid) {
      sid = crypto.randomUUID();
      try {
        window.localStorage?.setItem('mm_session', sid);
      } catch {}
    }
    setSessionId(sid);
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (sessionId && hydrated)
      try {
        window.localStorage?.setItem('mm_cart', JSON.stringify(items));
      } catch {}
  }, [items, sessionId, hydrated]);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(''), 2600);
  };
  const value = useMemo(
    () => ({
      items,
      sessionId,
      add: (item: CartItem) => {
        setItems((x) => [...x, item]);
        trackCommerce(
          'AddToCart',
          { quantity: item.quantity, value: item.unitPrice * item.quantity },
          item.productId,
        );
        emitCompanionEvent('ADD_TO_CART', {
          productId: item.productId,
          metadata: { quantity: item.quantity, selections: item.selections },
        });
        notify('Added to cart');
      },
      remove: (id: string) => {
        const item = items.find((i) => i.id === id);
        setItems((x) => x.filter((i) => i.id !== id));
        emitCompanionEvent('REMOVE_FROM_CART', { productId: item?.productId });
        notify('Removed from cart');
        trackCommerce('remove_from_cart', {}, item?.productId);
      },
      quantity: (id: string, n: number) =>
        setItems((x) =>
          x.map((i) => (i.id === id ? { ...i, quantity: Math.max(1, n) } : i)),
        ),
      clear: () => setItems([]),
      toast,
      notify,
    }),
    [items, sessionId, toast],
  );
  return (
    <Context.Provider value={value}>
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error('StoreProvider missing');
  return value;
}
