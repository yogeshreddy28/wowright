import { env } from 'cloudflare:workers';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { revealDeliveryOtp } from '@/lib/services/delivery-otp';
import { safeError } from '@/lib/services/launch-rules';

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const customer = await getCustomerFromRequest(request, env.DB);
  if (!customer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { orderId } = await params;
  const order = await env.DB.prepare('SELECT id FROM orders WHERE order_number=? AND customer_id=?').bind(orderId, customer.id).first<{ id: string }>();
  if (!order) return Response.json({ error: 'Order not found.' }, { status: 404 });
  try {
    const otp = await revealDeliveryOtp(env.DB, order.id, customer.id, env.DELIVERY_OTP_SECRET || env.AI_SETTINGS_ENCRYPTION_KEY);
    return Response.json({ otp }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return safeError(error); }
}
