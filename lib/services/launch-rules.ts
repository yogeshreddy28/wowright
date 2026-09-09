import { z } from 'zod';

// Approved launch rules, independent of legacy/demo delivery settings.
export const LAUNCH_COMMERCE = Object.freeze({
  minimumOrder: 499,
  deliveryCharge: 49,
  freeDeliveryThreshold: 999,
  dailyPrintMinutes: 600,
});
export class CommerceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function launchTotals(subtotal: number) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0)
    throw new CommerceError('Invalid cart amount.');
  const missing = Math.max(0, LAUNCH_COMMERCE.minimumOrder - subtotal);
  return {
    subtotal,
    missing,
    freeDeliveryRemaining: Math.max(
      0,
      LAUNCH_COMMERCE.freeDeliveryThreshold - subtotal,
    ),
    deliveryAmount:
      subtotal >= LAUNCH_COMMERCE.freeDeliveryThreshold || subtotal === 0
        ? 0
        : LAUNCH_COMMERCE.deliveryCharge,
    total:
      subtotal +
      (subtotal >= LAUNCH_COMMERCE.freeDeliveryThreshold || subtotal === 0
        ? 0
        : LAUNCH_COMMERCE.deliveryCharge),
  };
}
export const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
// Conservative launch envelope; PIN, written city/state AND location must agree.
// Deliberately not a claim of full municipal-boundary coverage.
export function assertBengaluru(address: {
  city: string;
  state: string;
  pinCode: string;
  latitude: number;
  longitude: number;
}) {
  locationSchema.parse(address);
  if (
    !/^(bengaluru|bangalore)$/i.test(address.city.trim()) ||
    !/^karnataka$/i.test(address.state.trim()) ||
    !/^560\d{3}$/.test(address.pinCode) ||
    address.latitude < 12.8 ||
    address.latitude > 13.15 ||
    address.longitude < 77.4 ||
    address.longitude > 77.8
  )
    throw new CommerceError(
      'Delivery is currently available only within our Bengaluru launch area. Check your PIN code and map location.',
    );
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new CommerceError('Cross-site request rejected.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new CommerceError('Cross-site request rejected.', 403);
}
export function safeError(
  error: unknown,
  fallback = 'The request could not be completed.',
) {
  return Response.json(
    {
      error:
        error instanceof CommerceError
          ? error.message
          : error instanceof z.ZodError
            ? error.issues[0]?.message || 'Check the supplied details.'
            : fallback,
    },
    { status: error instanceof CommerceError ? error.status : 400 },
  );
}
