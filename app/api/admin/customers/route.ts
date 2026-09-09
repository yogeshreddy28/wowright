import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT * FROM customers ORDER BY last_order_at DESC,created_at DESC LIMIT 100',
  ).all();
  return Response.json({ customers: result.results });
}
