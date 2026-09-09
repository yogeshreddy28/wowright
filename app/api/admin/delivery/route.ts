import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { hashCustomerPassword } from '@/lib/customer-auth';
import { normalizeIndianPhone } from '@/lib/services/phone';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { assignBatch, suggestRoute } from '@/lib/services/delivery-workflow';
import { getCashSummary, recordCashSettlement } from '@/lib/services/cash-reconciliation';
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const [people, ready, batches, collections] = await env.DB.batch([
    env.DB.prepare(
      'SELECT id,name,mobile,active FROM delivery_people ORDER BY name',
    ),
    env.DB.prepare(
      "SELECT o.id,o.order_number,o.latitude,o.longitude,o.total,o.payment_status,o.promised_delivery_date,o.estimated_delivery_date,o.status,c.name,a.locality FROM orders o JOIN customers c ON c.id=o.customer_id JOIN customer_addresses a ON a.id=o.address_id WHERE o.status IN ('ready','packed','delivery_failed','reschedule_required') ORDER BY o.created_at",
    ),
    env.DB.prepare(
      `SELECT b.*,p.name person_name,(SELECT COUNT(*) FROM delivery_stops s WHERE s.batch_id=b.id) stops,(SELECT COUNT(*) FROM delivery_stops s WHERE s.batch_id=b.id AND s.status='delivered') completed_stops,(SELECT COUNT(*) FROM delivery_stops s WHERE s.batch_id=b.id AND s.status='failed') failed_stops,(SELECT COUNT(*) FROM delivery_stops s WHERE s.batch_id=b.id AND s.status IN ('out_for_delivery','arrived','later_today')) active_stops,(SELECT COALESCE(SUM(o.total),0) FROM delivery_stops s JOIN orders o ON o.id=s.order_id WHERE s.batch_id=b.id AND o.payment_status='cod' AND s.status NOT IN ('delivered','failed')) cod_remaining,(SELECT json_group_array(json_object('order',route.order_number,'area',route.locality,'status',route.status)) FROM (SELECT o.order_number,a.locality,s.status FROM delivery_stops s JOIN orders o ON o.id=s.order_id JOIN customer_addresses a ON a.id=o.address_id WHERE s.batch_id=b.id ORDER BY s.sort_order) route) route FROM delivery_batches b JOIN delivery_people p ON p.id=b.person_id ORDER BY b.delivery_date DESC LIMIT 50`,
    ),
    env.DB.prepare(
      'SELECT p.*,o.order_number,o.is_test,d.name person_name FROM payment_collections p JOIN orders o ON o.id=p.order_id LEFT JOIN delivery_people d ON d.id=p.person_id ORDER BY p.collected_at DESC LIMIT 100',
    ),
  ]);
  const cashByPerson = await Promise.all((people.results as { id: string; name: string }[]).map(async (person) => {
    const upi = await env.DB.prepare("SELECT COALESCE(SUM(pc.amount_collected),0) amount FROM payment_collections pc JOIN orders o ON o.id=pc.order_id WHERE pc.person_id=? AND pc.method='UPI' AND o.is_test=0").bind(person.id).first<{ amount: number }>();
    return { personId: person.id, name: person.name, ...(await getCashSummary(env.DB, person.id)), upiCollected: Number(upi?.amount || 0) };
  }));
  const settlementHistory = await env.DB.prepare('SELECT s.*,p.name person_name FROM cash_settlements s JOIN delivery_people p ON p.id=s.person_id ORDER BY s.created_at DESC LIMIT 100').all();
  return Response.json({
    people: people.results,
    ready: ready.results,
    batches: batches.results,
    collections: collections.results,
    cashByPerson,
    settlementHistory: settlementHistory.results,
    suggestedOrderIds: suggestRoute(
      (
        ready.results as { id: string; latitude: number; longitude: number }[]
      ).filter(
        (r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude),
      ),
    ).map((r) => r.id),
  });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const raw = (await request.json()) as { action: string };
    if (raw.action === 'assign')
      return Response.json(await assignBatch(env.DB, raw));
    if (raw.action === 'person') {
      const data = z
          .object({
            name: z.string().trim().min(2).max(100),
            phone: z.string(),
            password: z.string().min(12).max(128),
          })
          .parse(raw),
        now = new Date().toISOString();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO delivery_people (id,name,mobile,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
        .bind(
          id,
          data.name,
          normalizeIndianPhone(data.phone),
          await hashCustomerPassword(data.password),
          now,
          now,
        )
        .run();
      return Response.json({ id });
    }
    if (raw.action === 'disable') {
      const data = z.object({ personId: z.string() }).parse(raw);
      await env.DB.batch([
        env.DB.prepare(
          'UPDATE delivery_people SET active=0,updated_at=? WHERE id=?',
        ).bind(new Date().toISOString(), data.personId),
        env.DB.prepare('DELETE FROM delivery_sessions WHERE person_id=?').bind(
          data.personId,
        ),
      ]);
      return Response.json({ ok: true });
    }
    if (raw.action === 'cash_settlement') {
      const data = z.object({ action: z.literal('cash_settlement'), personId: z.string(), amount: z.coerce.number().int().positive(), note: z.string().trim().max(300).optional() }).parse(raw);
      return Response.json({ summary: await recordCashSettlement(env.DB, data.personId, data.amount, data.note) });
    }
    const data = z
      .object({ action: z.literal('settle'), collectionId: z.string() })
      .parse(raw);
    await env.DB.prepare(
      "UPDATE payment_collections SET settlement_status='settled',settled_at=? WHERE id=? AND settlement_status='pending'",
    )
      .bind(new Date().toISOString(), data.collectionId)
      .run();
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
