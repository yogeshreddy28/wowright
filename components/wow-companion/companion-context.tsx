'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '@/components/store-provider';
import {
  canPrompt,
  promptForTrigger,
  triggerForEvent,
} from '@/lib/companion/behavior';
import { parseCampaign, pageTypeFromPath } from '@/lib/companion/campaign';
import {
  emitCompanionEvent,
  subscribeCompanionEvents,
  trackCompanionEvent,
} from '@/lib/companion/events';
import { scoreEvent, intentStage } from '@/lib/companion/intent';
import { nextCompanionState, stateForTrigger } from '@/lib/companion/machine';
import type {
  CompanionContext,
  CompanionEvent,
  CompanionState,
  CompanionTrigger,
} from '@/lib/companion/types';
type CompanionStore = {
  context: CompanionContext;
  state: CompanionState;
  open: boolean;
  prompt: string;
  setOpen: (open: boolean) => void;
  dismissPrompt: () => void;
  setState: (state: CompanionState) => void;
  showTrigger: (trigger: CompanionTrigger, force?: boolean) => void;
};
const Context = createContext<CompanionStore | null>(null);
function initialContext(sessionId: string, path: string): CompanionContext {
  return {
    sessionId,
    pageType: pageTypeFromPath(path),
    path,
    campaign: { isMeta: false },
    cart: [],
    checkoutProgress: 'browsing',
    behavior: {
      pageViews: 0,
      productViews: {},
      variantChanges: 0,
      customizationChanges: 0,
      pageEnteredAt: Date.now(),
    },
    intentScore: 0,
    intentStage: 'explorer',
    dismissals: 0,
    companionEngaged: false,
    experimentVariant: 'control',
  };
}
export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const { sessionId, items } = useStore();
  const path = usePathname();
  const [context, setContext] = useState<CompanionContext>(() =>
    initialContext('', path),
  );
  const [state, setState] = useState<CompanionState>('idle');
  const [open, setOpenRaw] = useState(false);
  const [prompt, setPrompt] = useState('');
  const contextRef = useRef(context);
  const openRef = useRef(open);
  const proactiveRef = useRef(true);
  const cooldownRef = useRef(50_000);
  contextRef.current = context;
  openRef.current = open;
  const showTrigger = useCallback(
    (trigger: CompanionTrigger, force = false) => {
      const current = contextRef.current;
      if (
        !force &&
        (!proactiveRef.current ||
          !canPrompt(current, Date.now(), cooldownRef.current, openRef.current))
      )
        return;
      setPrompt(promptForTrigger(trigger, current));
      setState(stateForTrigger(trigger));
      setContext((c) => ({
        ...c,
        lastPromptAt: Date.now(),
        lastPromptPage: c.path,
      }));
      trackCompanionEvent('companion_prompt', current.sessionId, {
        trigger,
        intentStage: current.intentStage,
      });
    },
    [],
  );
  useEffect(() => {
    if (!sessionId) return;
    setPrompt('');
    let saved: Partial<CompanionContext> = {};
    try {
      saved = JSON.parse(localStorage.getItem('wow_companion_context') || '{}');
    } catch {}
    const campaign = parseCampaign(location.search);
    setContext((c) => ({
      ...c,
      ...saved,
      sessionId,
      path,
      pageType: pageTypeFromPath(path),
      campaign:
        campaign.source || campaign.fbclid
          ? campaign
          : saved.campaign || campaign,
      behavior: {
        ...(saved.behavior || c.behavior),
        pageViews: (saved.behavior?.pageViews || 0) + 1,
        pageEnteredAt: Date.now(),
        lastEvent: 'PAGE_VIEW',
        lastEventAt: Date.now(),
      },
    }));
    emitCompanionEvent('PAGE_VIEW', { path });
    const timer = setTimeout(
      () => showTrigger(campaign.isMeta ? 'META_AD_ENTRY' : 'FIRST_VISIT'),
      campaign.isMeta ? 2200 : 4200,
    );
    return () => clearTimeout(timer);
  }, [sessionId, path, showTrigger]);
  useEffect(() => {
    fetch('/api/companion/config')
      .then(
        async (r) =>
          (await r.json()) as {
            companionEnabled?: boolean;
            companionProactiveEnabled?: boolean;
            companionExperimentVariant?: string;
            companionPromptCooldown?: number;
          },
      )
      .then((config) => {
        proactiveRef.current = config.companionProactiveEnabled !== false;
        cooldownRef.current =
          Math.max(30, Number(config.companionPromptCooldown) || 50) * 1000;
        setContext((c) => ({
          ...c,
          experimentVariant: config.companionExperimentVariant || 'control',
        }));
        if (config.companionEnabled === false) setState('hidden');
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setContext((c) => ({
      ...c,
      cart: items,
      checkoutProgress:
        path === '/cart'
          ? 'cart'
          : path === '/checkout'
            ? 'checkout'
            : c.checkoutProgress,
    }));
  }, [items, path]);
  useEffect(
    () =>
      subscribeCompanionEvents((event: CompanionEvent) => {
        setContext((c) => {
          const score = scoreEvent(c.intentScore, event);
          const productId =
            event.productId || String(event.metadata?.productId || '');
          const productViews = { ...c.behavior.productViews };
          if (event.name === 'PRODUCT_VIEW' && productId)
            productViews[productId] = (productViews[productId] || 0) + 1;
          const next = {
            ...c,
            currentProduct:
              (event.metadata?.product as CompanionContext['currentProduct']) ||
              c.currentProduct,
            selectedOptions:
              (event.metadata
                ?.selections as CompanionContext['selectedOptions']) ||
              c.selectedOptions,
            checkoutProgress:
              event.name === 'CHECKOUT_STARTED'
                ? 'checkout'
                : event.name === 'CHECKOUT_COMPLETED'
                  ? 'order_saved'
                  : c.checkoutProgress,
            intentScore: score,
            intentStage: intentStage(score),
            behavior: {
              ...c.behavior,
              productViews,
              variantChanges:
                c.behavior.variantChanges +
                (event.name === 'VARIANT_SELECTED' ? 1 : 0),
              customizationChanges:
                c.behavior.customizationChanges +
                (event.name === 'CUSTOMIZATION_CHANGED' ? 1 : 0),
              lastEvent: event.name,
              lastEventAt: event.at,
            },
          };
          const trigger = triggerForEvent(event, next);
          if (trigger) setTimeout(() => showTrigger(trigger), 0);
          if (event.name === 'PRODUCT_VIEW')
            setTimeout(() => {
              if (
                contextRef.current.currentProduct?.id === productId &&
                contextRef.current.path === next.path
              )
                showTrigger('PRODUCT_HESITATION');
            }, 25_000);
          if (event.name === 'CUSTOMIZATION_STARTED')
            setTimeout(() => showTrigger('CUSTOMIZATION_HESITATION'), 22_000);
          if (event.name === 'CART_VIEW' && next.cart.length)
            setTimeout(() => showTrigger('CART_IDLE'), 45_000);
          return next;
        });
        trackCompanionEvent(
          event.name.toLowerCase(),
          contextRef.current.sessionId,
          event.metadata || {},
        );
      }),
    [showTrigger],
  );
  useEffect(() => {
    if (sessionId)
      trackCompanionEvent('companion_impression', sessionId, {
        variant: context.experimentVariant,
      });
  }, [sessionId, context.experimentVariant]);
  useEffect(() => {
    if (!context.sessionId) return;
    const minimal = {
      ...context,
      cart: context.cart.map((i) => ({
        productId: i.productId,
        slug: i.slug,
        name: i.name,
        quantity: i.quantity,
        selections: i.selections,
      })),
    };
    localStorage.setItem('wow_companion_context', JSON.stringify(minimal));
    const timer = setTimeout(
      () =>
        fetch('/api/companion/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: context.sessionId,
            currentProductId: context.currentProduct?.id,
            checkoutProgress: context.checkoutProgress,
            intentScore: context.intentScore,
            intentStage: context.intentStage,
            dismissals: context.dismissals,
            companionEngaged: context.companionEngaged,
            source: context.campaign.source,
            campaign: context.campaign.campaign,
            context: minimal,
          }),
        }).catch(() => {}),
      700,
    );
    return () => clearTimeout(timer);
  }, [context]);
  const setOpen = useCallback((value: boolean) => {
    setOpenRaw(value);
    openRef.current = value;
    setPrompt('');
    setState((s) => nextCompanionState(s, value ? 'OPEN' : 'CLOSE'));
    setContext((c) => ({
      ...c,
      companionEngaged: c.companionEngaged || value,
    }));
    emitCompanionEvent(value ? 'COMPANION_OPENED' : 'COMPANION_CLOSED');
  }, []);
  const dismissPrompt = useCallback(() => {
    setPrompt('');
    setState('idle');
    setContext((c) => ({ ...c, dismissals: c.dismissals + 1 }));
    emitCompanionEvent('COMPANION_DISMISSED');
  }, []);
  const value = useMemo(
    () => ({
      context,
      state,
      open,
      prompt,
      setOpen,
      dismissPrompt,
      setState,
      showTrigger,
    }),
    [context, state, open, prompt, setOpen, dismissPrompt, showTrigger],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useCompanion() {
  const value = useContext(Context);
  if (!value) throw new Error('CompanionProvider missing');
  return value;
}
