import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { priceCustomRequest } from '@/lib/services/custom-orders';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT * FROM custom_quote_requests ORDER BY created_at DESC LIMIT 100',
  ).all();
  const files = await env.DB.prepare(
    'SELECT id,quote_request_id,original_name,size FROM uploaded_files ORDER BY created_at DESC LIMIT 500',
  ).all();
  return Response.json({ quotes: result.results, files: files.results });
}
export async function POST(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(r);
    return Response.json(await priceCustomRequest(env.DB, await r.json()));
  } catch (e) {
    return safeError(e);
  }
}
