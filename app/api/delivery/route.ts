import { dispatchMetaInBackground } from '@/lib/services/meta-background';
import { env } from 'cloudflare:workers';
import { deliveryPerson } from '@/lib/delivery-auth';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { updateStop } from '@/lib/services/delivery-workflow';
import { getCashSummary } from '@/lib/services/cash-reconciliation';
export async function GET(request: Request) {
  const person = await deliveryPerson(request, env.DB);
  if (!person) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const stops = await env.DB.prepare(
    "SELECT s.id,s.batch_id,s.status,s.availability_note,s.failure_reason,s.sort_order,b.delivery_date,b.time_window,o.order_number,o.latitude,o.longitude,o.total,o.payment_status,c.name,c.mobile,a.line1,a.line2,a.locality,a.pin_code,a.landmark,(SELECT CASE WHEN x.verified_at IS NOT NULL THEN 'verified' WHEN julianday(x.expires_at)<=julianday('now') THEN 'expired' ELSE 'pending' END FROM delivery_otps x WHERE x.stop_id=s.id AND x.invalidated_at IS NULL ORDER BY x.generated_at DESC LIMIT 1) otp_status,(SELECT json_group_array(json_object('name',i.product_name,'quantity',i.quantity,'finish',i.selected_finish)) FROM order_items i WHERE i.order_id=o.id) items FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id JOIN orders o ON o.id=s.order_id JOIN customers c ON c.id=o.customer_id JOIN customer_addresses a ON a.id=o.address_id WHERE b.person_id=? AND b.delivery_date>=date('now','-1 day') ORDER BY b.delivery_date,s.sort_order",
  )
    .bind(person.id)
    .all();
  const collections = await env.DB.prepare(
    "SELECT p.method,SUM(p.amount_collected) amount FROM payment_collections p WHERE p.person_id=? AND substr(p.collected_at,1,10)=date('now') GROUP BY p.method",
  )
    .bind(person.id)
    .all();
  return Response.json({
    person,
    stops: stops.results,
    collections: collections.results,
    cash: await getCashSummary(env.DB, person.id),
  });
}
export async function POST(request: Request) {
  const person = await deliveryPerson(request, env.DB);
  if (!person) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const result = await updateStop(env.DB, person.id, await request.json());
    dispatchMetaInBackground(env.DB);
    return Response.json(result);
  } catch (e) {
    return safeError(e);
  }
}
