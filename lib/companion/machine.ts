import type { CompanionState, CompanionTrigger } from './types';
export function stateForTrigger(trigger: CompanionTrigger): CompanionState {
  switch (trigger) {
    case 'FIRST_VISIT':
    case 'META_AD_ENTRY':
      return 'wave';
    case 'PRODUCT_HESITATION':
    case 'REPEAT_PRODUCT_VIEW':
    case 'MULTIPLE_VARIANT_CHANGES':
    case 'CUSTOMIZATION_HESITATION':
      return 'attention';
    case 'CART_ADDED':
      return 'happy';
    case 'CHECKOUT_ERROR':
      return 'concerned';
    case 'WHATSAPP_HANDOFF':
      return 'pointing';
    case 'ORDER_SUCCESS':
      return 'celebrate';
    case 'CHECKOUT_STARTED':
      return 'idle';
    default:
      return 'idle';
  }
}
export function nextCompanionState(
  state: CompanionState,
  event: 'OPEN' | 'CLOSE' | 'THINK' | 'SPEAK' | 'DONE' | 'HIDE',
) {
  if (event === 'HIDE') return 'hidden';
  if (event === 'OPEN') return 'listening';
  if (event === 'THINK') return 'thinking';
  if (event === 'SPEAK') return 'talking';
  if (event === 'CLOSE') return 'idle';
  if (event === 'DONE' && ['thinking', 'talking', 'listening'].includes(state))
    return 'idle';
  return state;
}
