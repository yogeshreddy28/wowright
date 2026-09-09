import { env } from 'cloudflare:workers';
import { getDeliveryConfig, getPaymentConfig } from '@/lib/services/delivery';
export async function GET() {
  const [delivery, payment] = await Promise.all([
    getDeliveryConfig(env.DB),
    getPaymentConfig(env.DB),
  ]);
  return Response.json({ delivery, payment });
}
