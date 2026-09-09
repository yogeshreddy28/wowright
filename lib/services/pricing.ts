import type { Product, Selection } from '../domain';
export function assertPurchasableProduct(product: Product | undefined) {
  if (
    !product ||
    !product.active ||
    product.status === 'draft' ||
    product.status === 'unavailable' ||
    product.publishingStatus === 'draft' ||
    (product.availability != null && product.availability !== 'available') ||
    product.stockMode === 'quote_only' ||
    product.productType === 'customizable' ||
    product.basePrice <= 0
  )
    throw new Error('A product is no longer available');
  return product;
}
export function calculateUnitPrice(
  product: Product,
  selections: Selection,
  variantId?: string,
) {
  const variant = variantId
    ? product.variants?.find(
        (item) =>
          item.id === variantId &&
          item.active &&
          item.availability === 'available',
      )
    : undefined;
  if (variantId && !variant) throw new Error('Invalid or unavailable finish');
  if (product.variants?.some((item) => item.active) && !variantId)
    throw new Error('Choose a finish');
  let total =
    variant?.sellingPrice ??
    product.basePrice + (variant?.priceAdjustment || 0);
  const adjustments: Record<string, number> = {};
  for (const key of Object.keys(selections)) {
    if (!product.options.some((option) => option.key === key))
      throw new Error('Invalid customization');
  }
  for (const option of product.options) {
    const selected = selections[option.key];
    if (option.required && (selected === undefined || selected === ''))
      throw new Error(`${option.name} is required`);
    if (selected === undefined || selected === '') continue;
    if (typeof selected === 'string' && selected.length > 1000)
      throw new Error(`Invalid ${option.name}`);
    if (
      option.type === 'number' &&
      (typeof selected !== 'number' ||
        !Number.isFinite(selected) ||
        selected < 0)
    )
      throw new Error(`Invalid ${option.name}`);
    if (option.values?.length) {
      const value = option.values.find((v) => v.value === String(selected));
      if (!value) throw new Error(`Invalid ${option.name}`);
      total += value.priceAdjustment;
      adjustments[option.key] = value.priceAdjustment;
    }
  }
  if (!Number.isSafeInteger(total) || total <= 0)
    throw new Error('Invalid product price');
  return { unitPrice: total, adjustments };
}
export function calculateCart(
  items: { unitPrice: number; quantity: number }[],
  delivery: { baseCharge: number; freeThreshold?: number | null },
) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const deliveryAmount =
    delivery.freeThreshold && subtotal >= delivery.freeThreshold
      ? 0
      : delivery.baseCharge;
  return { subtotal, deliveryAmount, total: subtotal + deliveryAmount };
}
export function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function getStartingPrice(product: Product) {
  const finishPrices = (product.variants || [])
    .filter((variant) => variant.active && variant.availability === 'available')
    .map(
      (variant) =>
        variant.sellingPrice ?? product.basePrice + variant.priceAdjustment,
    );
  return finishPrices.length ? Math.min(...finishPrices) : product.basePrice;
}
