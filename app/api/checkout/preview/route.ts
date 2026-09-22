import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { durableRateLimit } from '@/lib/rate-limit';
import {
  checkoutItems,
  verifyCheckoutCart,
} from '@/lib/services/checkout-cart';
import { planOrder } from '@/lib/services/production';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = z
      .object({
        sessionId: z.string().uuid(),
        items: checkoutItems,
      })
      .parse(await request.json());
    if (
      !(await durableRateLimit(
        env.DB,
        'checkout-preview:' + input.sessionId,
        30,
        60_000,
      ))
    )
      throw new CommerceError(
        'Please wait a minute before checking again.',
        429,
      );
    const { verified, totals } = await verifyCheckoutCart(env.DB, input.items);
    const plan = await planOrder(
      env.DB,
      verified.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        estimated_print_minutes: item.internal?.estimated_print_minutes ?? null,
      })),
    );
    // A preview does not reserve capacity, create an order, or reveal production data.
    return Response.json(
      {
        totals,
        estimatedDeliveryDate: plan.estimatedDeliveryDate,
        requiresOwnerSchedule: !plan.estimatedDeliveryDate,
        checkedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return safeError(
      error,
      'We could not check your order estimate. Please try again.',
    );
  }
}
