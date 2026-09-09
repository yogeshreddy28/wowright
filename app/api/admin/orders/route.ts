import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const u = new URL(r.url),
    q = (u.searchParams.get('q') || '').slice(0, 80),
    status = u.searchParams.get('status'),
    paymentStatus = u.searchParams.get('paymentStatus'),
    page = Math.max(1, Number(u.searchParams.get('page') || 1));
  let sql = `SELECT o.id,o.order_number,o.status,o.payment_status,o.payment_method,o.total,o.created_at,o.estimated_delivery_date,o.promised_delivery_date,c.name customer_name,c.mobile,(SELECT GROUP_CONCAT(product_name, ', ') FROM order_items WHERE order_id=o.id) products FROM orders o JOIN customers c ON c.id=o.customer_id WHERE 1=1`;
  const binds: unknown[] = [];
  if (q) {
    sql += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)`;
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'needs_confirmation') {
    sql += ` AND o.status IN ('payment_pending','awaiting_confirmation','payment_failed')`;
  } else if (status === 'at_risk') {
    sql += ` AND o.is_test=0 AND o.status NOT IN ('cancelled','delivered') AND COALESCE(o.promised_delivery_date,o.estimated_delivery_date)<date('now','+5 hours','+30 minutes')`;
  } else if (status) {
    sql += ` AND o.status=?`;
    binds.push(status);
  }
  if (paymentStatus) {
    sql += ` AND o.payment_status=?`;
    binds.push(paymentStatus);
    if (paymentStatus === 'cod') sql += ` AND o.status<>'cancelled'`;
  }
  sql += ` ORDER BY o.created_at DESC LIMIT 25 OFFSET ?`;
  binds.push((page - 1) * 25);
  const result = await env.DB.prepare(sql)
    .bind(...binds)
    .all();
  return Response.json({ orders: result.results, page });
}
