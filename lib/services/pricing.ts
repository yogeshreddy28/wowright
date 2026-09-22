import type {
  CalculatedProductSize,
  Product,
  ProductSizePriceBand,
  Selection,
} from '../domain';

const SIZE_EPSILON = 0.0001;

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function isValidSizeIncrement(
  value: number,
  minimum: number,
  increment: number,
) {
  const steps = (value - minimum) / increment;
  return Math.abs(steps - Math.round(steps)) < SIZE_EPSILON;
}

export function resolveSizePriceBand(
  bands: ProductSizePriceBand[],
  height: number,
) {
  return bands.find(
    (band) =>
      height >= band.minimumHeight - SIZE_EPSILON &&
      height <= band.maximumHeight + SIZE_EPSILON,
  );
}

/** Trusted proportional sizing. The browser may request only height. */
export function calculateProductSize(
  product: Pick<Product, 'sizing' | 'structuredDimensions'>,
  requestedHeight?: number,
): CalculatedProductSize | undefined {
  if (!product.sizing?.enabled) return undefined;
  const { minimumHeight, maximumHeight, defaultHeight, increment, priceBands } =
    product.sizing;
  const original = product.structuredDimensions;
  if (
    minimumHeight == null ||
    maximumHeight == null ||
    defaultHeight == null ||
    increment == null ||
    !original?.height ||
    !original.width ||
    !original.depth
  )
    throw new Error('Product sizing is not configured');
  const selectedHeight = requestedHeight ?? defaultHeight;
  if (
    !Number.isFinite(selectedHeight) ||
    selectedHeight < minimumHeight - SIZE_EPSILON ||
    selectedHeight > maximumHeight + SIZE_EPSILON ||
    !isValidSizeIncrement(selectedHeight, minimumHeight, increment)
  )
    throw new Error('Choose an available size');
  const pricingBand = resolveSizePriceBand(priceBands, selectedHeight);
  if (!pricingBand) throw new Error('Price is not configured for this size');
  const scale = selectedHeight / original.height;
  return {
    selectedHeight: rounded(selectedHeight),
    width: rounded(original.width * scale),
    depth: rounded(original.depth * scale),
    scale: Math.round(scale * 10_000) / 10_000,
    pricingBandId: pricingBand.id,
    pricingVersion: pricingBand.version || product.sizing.pricingVersion,
    dimensionUnit: original.unit,
    recommendation: product.sizing.recommendations.find(
      (item) =>
        selectedHeight >= item.minimumHeight - SIZE_EPSILON &&
        selectedHeight <= item.maximumHeight + SIZE_EPSILON,
    ),
  };
}
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
    getStartingPrice(product) <= 0
  )
    throw new Error('A product is no longer available');
  return product;
}
export function calculateUnitPrice(
  product: Product,
  selections: Selection,
  variantId?: string,
  selectedHeight?: number,
  fixedSizeId?: string,
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
  const fixedSize = fixedSizeId
    ? product.fixedSizes?.find((item) => item.id === fixedSizeId && item.active)
    : undefined;
  if (product.fixedSizes?.some((item) => item.active) && !fixedSize)
    throw new Error('Choose an available fixed size');
  if (fixedSizeId && !fixedSize)
    throw new Error('Choose an available fixed size');
  if (fixedSize && selectedHeight !== undefined)
    throw new Error(
      'Custom dimensions cannot be entered for a fixed-size product',
    );
  const fixedPrice = fixedSize?.prices.find(
    (item) => item.variantId === variantId,
  )?.sellingPrice;
  if (fixedSize && !fixedPrice)
    throw new Error('This size and finish combination is unavailable');
  const sizing = calculateProductSize(product, selectedHeight);
  const sizeBand = sizing
    ? resolveSizePriceBand(product.sizing!.priceBands, sizing.selectedHeight)
    : undefined;
  let total = fixedSize
    ? fixedPrice!
    : sizing
      ? sizeBand!.sellingPrice + (variant?.priceAdjustment || 0)
      : (variant?.sellingPrice ??
        product.basePrice + (variant?.priceAdjustment || 0));
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
  return { unitPrice: total, adjustments, sizing, fixedSize };
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
  if (product.fixedSizes?.some((item) => item.active)) {
    const prices = product.fixedSizes
      .filter((item) => item.active)
      .flatMap((item) => item.prices)
      .filter((price) =>
        product.variants?.some(
          (variant) =>
            variant.id === price.variantId &&
            variant.active &&
            variant.availability === 'available',
        ),
      )
      .map((price) => price.sellingPrice);
    return prices.length ? Math.min(...prices) : 0;
  }
  if (product.sizing?.enabled && product.sizing.priceBands.length) {
    const base = Math.min(
      ...product.sizing.priceBands.map((band) => band.sellingPrice),
    );
    const finishAdjustments = (product.variants || [])
      .filter(
        (variant) => variant.active && variant.availability === 'available',
      )
      .map((variant) => variant.priceAdjustment);
    return (
      base + (finishAdjustments.length ? Math.min(...finishAdjustments) : 0)
    );
  }
  const finishPrices = (product.variants || [])
    .filter((variant) => variant.active && variant.availability === 'available')
    .map(
      (variant) =>
        variant.sellingPrice ?? product.basePrice + variant.priceAdjustment,
    );
  return finishPrices.length ? Math.min(...finishPrices) : product.basePrice;
}
