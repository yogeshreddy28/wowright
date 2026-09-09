import { describe, expect, it } from 'vitest';
import { canPrompt, triggerForEvent } from '@/lib/companion/behavior';
import { nextCompanionState, stateForTrigger } from '@/lib/companion/machine';
import type { CompanionContext, CompanionEvent } from '@/lib/companion/types';
const context = (
  overrides: Partial<CompanionContext> = {},
): CompanionContext => ({
  sessionId: 's',
  pageType: 'product',
  path: '/product/x',
  campaign: { isMeta: false },
  cart: [],
  checkoutProgress: 'browsing',
  behavior: {
    pageViews: 1,
    productViews: {},
    variantChanges: 0,
    customizationChanges: 0,
    pageEnteredAt: 0,
  },
  intentScore: 0,
  intentStage: 'explorer',
  dismissals: 0,
  companionEngaged: false,
  experimentVariant: 'control',
  ...overrides,
});
const event = (name: CompanionEvent['name']): CompanionEvent => ({
  name,
  at: 10,
});
describe('companion behavior engine', () => {
  it('enforces one prompt per page, cooldown, and dismiss limit', () => {
    expect(canPrompt(context(), 100_000, 50_000, false)).toBe(true);
    expect(
      canPrompt(context({ lastPromptAt: 80_000 }), 100_000, 50_000, false),
    ).toBe(false);
    expect(
      canPrompt(
        context({ lastPromptPage: '/product/x' }),
        100_000,
        50_000,
        false,
      ),
    ).toBe(false);
    expect(canPrompt(context({ dismissals: 2 }), 100_000, 50_000, false)).toBe(
      false,
    );
  });
  it('keeps checkout quiet except after validation errors', () => {
    expect(canPrompt(context({ pageType: 'checkout' }), 100_000)).toBe(false);
    expect(
      canPrompt(
        context({
          pageType: 'checkout',
          behavior: {
            ...context().behavior,
            lastEvent: 'CHECKOUT_VALIDATION_ERROR',
          },
        }),
        100_000,
      ),
    ).toBe(true);
  });
  it('maps events to deterministic triggers and mascot states', () => {
    expect(triggerForEvent(event('ADD_TO_CART'), context())).toBe('CART_ADDED');
    expect(stateForTrigger('CHECKOUT_ERROR')).toBe('concerned');
    expect(nextCompanionState('idle', 'THINK')).toBe('thinking');
    expect(nextCompanionState('thinking', 'SPEAK')).toBe('talking');
  });
  it('keeps account and post-purchase pages free of proactive sales overlays', () => {
    expect(
      canPrompt(context({ pageType: 'order', path: '/order/WR-TEST' })),
    ).toBe(false);
    expect(
      canPrompt(
        context({ pageType: 'order_success', path: '/order-success/WR-TEST' }),
      ),
    ).toBe(false);
    expect(
      canPrompt(context({ pageType: 'content', path: '/account/orders' })),
    ).toBe(false);
  });
});
