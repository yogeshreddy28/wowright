import type { CompanionEvent, IntentStage } from './types';
const points: Partial<Record<CompanionEvent['name'], number>> = {
  PRODUCT_VIEW: 5,
  PRODUCT_VIEW_REPEAT: 10,
  VARIANT_SELECTED: 10,
  CUSTOMIZATION_STARTED: 15,
  CUSTOMIZATION_CHANGED: 10,
  ADD_TO_CART: 25,
  CHECKOUT_STARTED: 25,
  CHECKOUT_VALIDATION_ERROR: -5,
  REMOVE_FROM_CART: -10,
  WHATSAPP_OPENED: 15,
};
export function scoreEvent(score: number, event: CompanionEvent) {
  let delta = points[event.name] || 0;
  if (
    event.name === 'PRODUCT_VIEW' &&
    Number(event.metadata?.dwellSeconds) >= 30
  )
    delta += 10;
  if (
    event.name === 'CUSTOMIZATION_CHANGED' &&
    event.metadata?.meaningful === true
  )
    delta += 10;
  if (event.name === 'COMPANION_MESSAGE_SENT') {
    const topic = String(event.metadata?.topic || '');
    if (topic === 'delivery') delta += 10;
    if (topic === 'payment') delta += 15;
  }
  return Math.max(0, Math.min(100, score + delta));
}
export function intentStage(score: number): IntentStage {
  if (score >= 81) return 'ready_to_buy';
  if (score >= 61) return 'high_intent';
  if (score >= 41) return 'evaluating';
  if (score >= 21) return 'interested';
  return 'explorer';
}
