import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
import { sameOrigin, safeError } from '@/lib/services/launch-rules';
import { z } from 'zod';

async function setting<T>(key: string): Promise<T | null> { const row = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first<{ value: string }>(); return row ? JSON.parse(row.value) as T : null; }
async function save(key: string, value: unknown) { await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, JSON.stringify(value), new Date().toISOString()).run(); }
async function unseen(startedAt: string) { return env.DB.prepare('SELECT o.id,o.order_number,o.created_at FROM orders o LEFT JOIN admin_order_acknowledgements a ON a.order_id=o.id WHERE o.is_test=0 AND o.created_at>? AND a.order_id IS NULL ORDER BY o.created_at DESC,o.id DESC LIMIT 100').bind(startedAt).all<{ id: string; order_number: string; created_at: string }>(); }
export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const startedAt = await setting<string>('adminOrderNotificationsStartedAt'), soundEnabled = Boolean(await setting<boolean>('adminOrderSoundEnabled'));
  if (!startedAt) return Response.json({ initialized: false, unseen: 0, orders: [], soundEnabled }, { headers: { 'Cache-Control': 'no-store' } });
  const rows = await unseen(startedAt);
  return Response.json({ initialized: true, unseen: rows.results.length, orders: rows.results, soundEnabled }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request))) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const data = z.discriminatedUnion('action', [z.object({ action: z.literal('initialize') }), z.object({ action: z.literal('acknowledge_order'), orderId: z.string().min(1) }), z.object({ action: z.literal('acknowledge_all') }), z.object({ action: z.literal('sound'), enabled: z.boolean() })]).parse(await request.json());
    if (data.action === 'sound') { await save('adminOrderSoundEnabled', data.enabled); return Response.json({ ok: true, soundEnabled: data.enabled }); }
    const now = new Date().toISOString();
    if (data.action === 'initialize') await save('adminOrderNotificationsStartedAt', now);
    else {
      const startedAt = await setting<string>('adminOrderNotificationsStartedAt') || now;
      if (data.action === 'acknowledge_order') await env.DB.prepare('INSERT OR IGNORE INTO admin_order_acknowledgements(order_id,acknowledged_at,actor) SELECT id,?,? FROM orders WHERE (id=? OR order_number=?) AND is_test=0 AND created_at>?').bind(now, 'admin', data.orderId, data.orderId, startedAt).run();
      else await env.DB.prepare('INSERT OR IGNORE INTO admin_order_acknowledgements(order_id,acknowledged_at,actor) SELECT id,?,? FROM orders WHERE is_test=0 AND created_at>?').bind(now, 'admin', startedAt).run();
    }
    await env.DB.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), data.action === 'initialize' ? 'admin_order_notifications_initialized' : data.action, JSON.stringify(data.action === 'acknowledge_order' ? { orderId: data.orderId } : {}), now).run();
    return Response.json({ ok: true });
  } catch (error) { return safeError(error); }
}
