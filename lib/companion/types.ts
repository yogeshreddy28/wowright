import type { CartItem, Product, Selection } from '@/lib/domain';

export type CompanionState =
  | 'idle'
  | 'sleeping'
  | 'attention'
  | 'wave'
  | 'listening'
  | 'thinking'
  | 'talking'
  | 'happy'
  | 'celebrate'
  | 'concerned'
  | 'pointing'
  | 'hidden';
export type IntentStage =
  | 'explorer'
  | 'interested'
  | 'evaluating'
  | 'high_intent'
  | 'ready_to_buy';
export type Objection =
  | 'PRICE'
  | 'DELIVERY'
  | 'TRUST'
  | 'QUALITY'
  | 'CUSTOMIZATION'
  | 'PAYMENT'
  | 'SIZE'
  | 'MATERIAL'
  | 'GIFT_CHOICE'
  | 'NOT_READY'
  | 'OTHER';
export type CompanionTrigger =
  | 'FIRST_VISIT'
  | 'META_AD_ENTRY'
  | 'PRODUCT_HESITATION'
  | 'REPEAT_PRODUCT_VIEW'
  | 'MULTIPLE_VARIANT_CHANGES'
  | 'CUSTOMIZATION_HESITATION'
  | 'CART_ADDED'
  | 'CART_IDLE'
  | 'CHECKOUT_STARTED'
  | 'CHECKOUT_ERROR'
  | 'WHATSAPP_HANDOFF'
  | 'ORDER_SUCCESS';
export type CompanionEventName =
  | 'PAGE_VIEW'
  | 'PRODUCT_VIEW'
  | 'PRODUCT_VIEW_REPEAT'
  | 'VARIANT_SELECTED'
  | 'CUSTOMIZATION_STARTED'
  | 'CUSTOMIZATION_CHANGED'
  | 'PRICE_VIEWED'
  | 'ADD_TO_CART'
  | 'REMOVE_FROM_CART'
  | 'CART_VIEW'
  | 'CHECKOUT_STARTED'
  | 'CHECKOUT_VALIDATION_ERROR'
  | 'CHECKOUT_COMPLETED'
  | 'WHATSAPP_OPENED'
  | 'COMPANION_OPENED'
  | 'COMPANION_CLOSED'
  | 'COMPANION_DISMISSED'
  | 'COMPANION_MESSAGE_SENT'
  | 'COMPANION_QUICK_REPLY'
  | 'PRODUCT_RECOMMENDATION_CLICKED';
export type PageType =
  | 'home'
  | 'shop'
  | 'product'
  | 'custom'
  | 'cart'
  | 'checkout'
  | 'order_success'
  | 'order'
  | 'content'
  | 'admin';
export type CampaignContext = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  fbclid?: string;
  isMeta: boolean;
};
export type BehaviorContext = {
  pageViews: number;
  productViews: Record<string, number>;
  variantChanges: number;
  customizationChanges: number;
  lastEvent?: CompanionEventName;
  lastEventAt?: number;
  pageEnteredAt: number;
};
export type CompanionContext = {
  sessionId: string;
  pageType: PageType;
  path: string;
  campaign: CampaignContext;
  currentProduct?: Pick<
    Product,
    | 'id'
    | 'slug'
    | 'name'
    | 'shortDescription'
    | 'basePrice'
    | 'leadTime'
    | 'images'
    | 'options'
  >;
  selectedOptions?: Selection;
  cart: CartItem[];
  checkoutProgress: 'browsing' | 'cart' | 'checkout' | 'order_saved';
  behavior: BehaviorContext;
  intentScore: number;
  intentStage: IntentStage;
  dismissals: number;
  lastPromptAt?: number;
  lastPromptPage?: string;
  companionEngaged: boolean;
  conversationId?: string;
  experimentVariant: string;
};
export type CompanionEvent = {
  name: CompanionEventName;
  at: number;
  path?: string;
  productId?: string;
  metadata?: Record<string, unknown>;
};
export type ProductRecommendation = Pick<
  Product,
  | 'id'
  | 'slug'
  | 'name'
  | 'shortDescription'
  | 'basePrice'
  | 'images'
  | 'leadTime'
>;
export type CompanionAction =
  | { type: 'recommendations'; products: ProductRecommendation[] }
  | {
      type: 'confirm_add_to_cart';
      product: ProductRecommendation;
      selections: Selection;
      quantity: number;
      unitPrice: number;
    }
  | { type: 'open_checkout' }
  | { type: 'open_custom_quote'; brief?: Record<string, string | number> }
  | { type: 'whatsapp_handoff' };
export type CompanionResponse = {
  message: string;
  conversationId?: string;
  quickReplies?: string[];
  action?: CompanionAction;
  objection?: Objection;
  provider: 'configured' | 'fallback';
};
