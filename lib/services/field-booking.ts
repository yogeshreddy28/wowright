import { z } from 'zod';
import { CommerceError } from './launch-rules';

export const fieldLocationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().max(10000).optional(),
});

export const noOrderReasons = [
  'Price',
  'Not interested',
  'Different products needed',
  'Ask later',
  'Other',
] as const;

export const bookingStatuses = [
  'booked',
  'approved',
  'printing',
  'ready',
  'delivered',
  'paid',
] as const;

export function distanceMetres(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function routeDistance(
  points: Array<{ latitude: number; longitude: number }>,
) {
  return points.slice(1).reduce(
    (total, point, index) => total + distanceMetres(points[index], point),
    0,
  );
}

export function fieldBookingNumber(random = crypto.getRandomValues(new Uint32Array(1))[0]) {
  return `WR-B-${String(random % 1_000_000).padStart(6, '0')}`;
}

export function assertBookingStatusTransition(current: string, next: string) {
  const currentIndex = bookingStatuses.indexOf(current as (typeof bookingStatuses)[number]);
  const nextIndex = bookingStatuses.indexOf(next as (typeof bookingStatuses)[number]);
  if (currentIndex < 0 || nextIndex !== currentIndex + 1)
    throw new CommerceError('Choose the next booking stage in order.');
}

export function productKind(product: { name: string; category: string; tags?: string }) {
  const haystack = `${product.name} ${product.category} ${product.tags || ''}`.toLowerCase();
  return haystack.includes('keychain') || haystack.includes('key chain')
    ? 'keychains'
    : 'models';
}
