import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { safeError, sameOrigin } from '@/lib/services/launch-rules';
import { z } from 'zod';
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT r.id,r.rating,r.body,r.status,r.moderation_reason,r.created_at,p.name product_name FROM reviews r LEFT JOIN products p ON p.id=r.product_id ORDER BY r.created_at DESC LIMIT 100',
  ).all();
  return Response.json({ reviews: result.results });
}
export async function POST(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(r);
    const d = z
      .object({
        id: z.string(),
        status: z.enum(['published', 'hidden']),
        reason: z.enum(['spam', 'abuse', 'prohibited_content', 'restored']),
      })
      .parse(await r.json());
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE reviews SET status=?,moderation_reason=?,updated_at=? WHERE id=?',
      ).bind(d.status, d.reason, new Date().toISOString(), d.id),
      env.DB.prepare(
        'INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)',
      ).bind(
        crypto.randomUUID(),
        'review_moderated',
        JSON.stringify(d),
        new Date().toISOString(),
      ),
    ]);
    return Response.json({ ok: true });
  } catch (e) {
    return safeError(e);
  }
}
