import { z } from 'zod';
import { getCatalogProductById } from '@/lib/catalog-repository';
import { assertPurchasableProduct, calculateUnitPrice } from './pricing';
import { CommerceError, launchTotals } from './launch-rules';

export const checkoutItems = z
  .array(
    z.object({
      productId: z.string().min(1).max(100),
      variantId: z.string().max(100).optional(),
      quantity: z.number().int().min(1).max(99),
      unitPrice: z.number().optional(),
      selections: z.record(
        z.string().max(50),
        z.union([z.string().max(1000), z.number().finite(), z.boolean()]),
      ),
    }),
  )
  .min(1)
  .max(30);

// Preview and checkout share this authority; client prices never determine totals.
export async function verifyCheckoutCart(
  db: D1Database,
  items: z.infer<typeof checkoutItems>,
) {
  const verified = await Promise.all(
    items.map(async (item) => {
      const product = await getCatalogProductById(item.productId);
      if (
        product?.stockMode === 'quote_only' ||
        product?.productType === 'customizable'
      )
        throw new CommerceError(
          'Customized products require a finalized quote and 100% prepaid UPI. Submit a customization request instead.',
          409,
        );
      let current, price;
      try {
        current = assertPurchasableProduct(product);
        price = calculateUnitPrice(current, item.selections, item.variantId);
      } catch {
        throw new CommerceError(
          'A product or customization is no longer available. Reopen the product and update your cart.',
          409,
        );
      }
      if (item.unitPrice != null && item.unitPrice !== price.unitPrice)
        throw new CommerceError(
          'A product price changed. Reopen the product and update your cart before checkout.',
          409,
        );
      const internal = await db
        .prepare(
          'SELECT COALESCE((SELECT sku FROM product_variants WHERE id=? AND product_id=?),sku) sku,estimated_print_minutes,internal_unit_cost FROM products WHERE id=?',
        )
        .bind(item.variantId || null, item.productId, item.productId)
        .first<{
          sku: string | null;
          estimated_print_minutes: number | null;
          internal_unit_cost: number | null;
        }>();
      return {
        ...item,
        id: crypto.randomUUID(),
        product: current,
        unitPrice: price.unitPrice,
        adjustments: price.adjustments,
        variant: current.variants?.find((v) => v.id === item.variantId),
        internal,
      };
    }),
  );
  const totals = launchTotals(
    verified.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );
  if (totals.missing)
    throw new CommerceError(
      'Add ₹' + totals.missing + ' more to place your order.',
      409,
    );
  return { verified, totals };
}
