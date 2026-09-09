export const COMPANION_TOOL_NAMES = [
  'searchProducts',
  'getProductDetails',
  'getAvailableVariants',
  'getProductOptions',
  'calculatePrice',
  'recommendProducts',
  'selectVariant',
  'prepareCustomization',
  'addToCart',
  'getCart',
  'estimateDelivery',
  'openCheckout',
  'prepareWhatsAppHandoff',
] as const;
export type CompanionToolName = (typeof COMPANION_TOOL_NAMES)[number];
export const MUTATING_COMPANION_TOOLS = new Set<CompanionToolName>([
  'addToCart',
  'selectVariant',
  'prepareCustomization',
]);
export function toolNeedsConfirmation(tool: CompanionToolName) {
  return MUTATING_COMPANION_TOOLS.has(tool);
}
