import type {
  CompanionContext,
  CompanionEvent,
  CompanionTrigger,
} from './types';
export const DEFAULT_PROMPT_COOLDOWN = 50_000;
export function triggerForEvent(
  event: CompanionEvent,
  context: CompanionContext,
): CompanionTrigger | undefined {
  if (event.name === 'PRODUCT_VIEW_REPEAT') return 'REPEAT_PRODUCT_VIEW';
  if (event.name === 'VARIANT_SELECTED' && context.behavior.variantChanges >= 3)
    return 'MULTIPLE_VARIANT_CHANGES';
  if (event.name === 'ADD_TO_CART') return 'CART_ADDED';
  if (event.name === 'CHECKOUT_STARTED') return 'CHECKOUT_STARTED';
  if (event.name === 'CHECKOUT_VALIDATION_ERROR') return 'CHECKOUT_ERROR';
  if (event.name === 'WHATSAPP_OPENED') return 'WHATSAPP_HANDOFF';
  if (event.name === 'CHECKOUT_COMPLETED') return 'ORDER_SUCCESS';
}
export function canPrompt(
  context: CompanionContext,
  now = Date.now(),
  cooldown = DEFAULT_PROMPT_COOLDOWN,
  chatOpen = false,
) {
  if (
    chatOpen ||
    context.dismissals >= 2 ||
    context.pageType === 'admin' ||
    context.pageType === 'order' ||
    context.pageType === 'order_success' ||
    context.path.startsWith('/account') ||
    (context.pageType === 'checkout' &&
      context.behavior.lastEvent !== 'CHECKOUT_VALIDATION_ERROR')
  )
    return false;
  if (context.lastPromptPage === context.path) return false;
  return !context.lastPromptAt || now - context.lastPromptAt >= cooldown;
}
export function promptForTrigger(
  trigger: CompanionTrigger,
  context: CompanionContext,
) {
  const product = context.currentProduct?.name;
  const prompts: Record<CompanionTrigger, string> = {
    FIRST_VISIT: 'Looking for something personal? I can help you choose.',
    META_AD_ENTRY:
      'Welcome to WOW RIGHT. Want help finding the product you saw?',
    PRODUCT_HESITATION: `Need help choosing${product ? ` your ${product}` : ''}?`,
    REPEAT_PRODUCT_VIEW: `Still considering ${product || 'this product'}? I can help compare the options.`,
    MULTIPLE_VARIANT_CHANGES:
      'Want me to help narrow down the best combination?',
    CUSTOMIZATION_HESITATION:
      'Tell me who it is for and I’ll help with the details.',
    CART_ADDED: 'Nice choice. I can help check the details before checkout.',
    CART_IDLE: 'Ready when you are—I can answer delivery or payment questions.',
    CHECKOUT_STARTED: 'I’ll stay quiet while you complete your details.',
    CHECKOUT_ERROR:
      'Something needs attention. I can help you finish this step.',
    WHATSAPP_HANDOFF:
      'Your details are saved. WhatsApp will open for confirmation.',
    ORDER_SUCCESS: 'Your order is saved—nice work!',
  };
  return prompts[trigger];
}
