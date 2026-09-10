export type OptionType =
  | 'select'
  | 'radio'
  | 'text'
  | 'textarea'
  | 'number'
  | 'boolean';
export type OptionValue = {
  id: string;
  label: string;
  value: string;
  priceAdjustment: number;
};
export type ProductOption = {
  id: string;
  key: string;
  name: string;
  type: OptionType;
  required: boolean;
  placeholder?: string;
  values?: OptionValue[];
};
export type Product = {
  productType?: 'normal' | 'customizable';
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  category: string;
  basePrice: number;
  compareAtPrice?: number;
  active: boolean;
  featured: boolean;
  stockMode: string;
  stockQuantity?: number;
  leadTime: string;
  images: string[];
  options: ProductOption[];
  sku?: string;
  status?: 'active' | 'draft' | 'unavailable';
  dimensions?: string;
  material?: string;
  deliveryNotes?: string;
  careInstructions?: string;
  madeToOrderNotice?: string;
  tags?: string[];
  finishReferenceImages?: Record<string, string>;
  relatedProductIds?: string[];
  publishingStatus?: 'draft' | 'published';
  availability?: 'available' | 'temporarily_unavailable' | 'discontinued';
  structuredDimensions?: {
    width?: number;
    depth?: number;
    height?: number;
    unit: string;
  };
  variants?: ProductVariant[];
  rating?: number;
  reviewCount?: number;
};
export type ProductVariant = {
  id: string;
  name: string;
  sku?: string;
  finishId?: string;
  sellingPrice?: number;
  originalPrice?: number;
  priceAdjustment: number;
  active: boolean;
  availability: 'available' | 'temporarily_unavailable' | 'discontinued';
  exactImage?: string;
  exactImages?: string[];
  referenceImage?: string;
  swatch?: string;
};
export type Selection = Record<string, string | number | boolean>;
export type CartItem = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  selections: Selection;
  unitPrice: number;
  image?: string;
  variantId?: string;
  variantName?: string;
};
export type Cart = { items: CartItem[] };
export type CheckoutCustomer = {
  name: string;
  mobile: string;
  email?: string;
  line1: string;
  line2?: string;
  locality: string;
  city: string;
  state: string;
  pinCode: string;
  landmark?: string;
  notes?: string;
};
export const ORDER_STATUSES = [
  'draft',
  'checkout_started',
  'awaiting_confirmation',
  'payment_pending',
  'payment_failed',
  'order_placed',
  'confirmed',
  'printing',
  'in_production',
  'quality_check',
  'packing',
  'scheduled',
  'reprint_required',
  'delayed',
  'delivery_failed',
  'reschedule_required',
  'packed',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus =
  | 'unpaid'
  | 'awaiting_payment'
  | 'paid'
  | 'cod'
  | 'refunded'
  | 'partially_refunded';
