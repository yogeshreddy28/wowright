import { describe, expect, it } from 'vitest';
import { intentStage, scoreEvent } from '@/lib/companion/intent';
import type { CompanionEvent } from '@/lib/companion/types';
const event = (
  name: CompanionEvent['name'],
  metadata?: Record<string, unknown>,
): CompanionEvent => ({ name, at: 1, metadata });
describe('companion intent', () => {
  it('uses bounded deterministic event weights', () => {
    let score = 0;
    score = scoreEvent(score, event('PRODUCT_VIEW', { dwellSeconds: 30 }));
    expect(score).toBe(15);
    score = scoreEvent(
      score,
      event('CUSTOMIZATION_CHANGED', { meaningful: true }),
    );
    expect(score).toBe(35);
    score = scoreEvent(score, event('ADD_TO_CART'));
    expect(score).toBe(60);
    score = scoreEvent(score, event('CHECKOUT_STARTED'));
    expect(score).toBe(85);
  });
  it('maps score bands to stages', () => {
    expect(intentStage(0)).toBe('explorer');
    expect(intentStage(21)).toBe('interested');
    expect(intentStage(41)).toBe('evaluating');
    expect(intentStage(61)).toBe('high_intent');
    expect(intentStage(81)).toBe('ready_to_buy');
  });
  it('never goes below zero or above 100', () => {
    expect(scoreEvent(2, event('REMOVE_FROM_CART'))).toBe(0);
    expect(scoreEvent(99, event('ADD_TO_CART'))).toBe(100);
  });
});
