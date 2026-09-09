import { env } from 'cloudflare:workers';
import { deliveryPerson } from '@/lib/delivery-auth';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { validateImage } from '@/lib/services/image-upload';
export async function POST(request: Request) {
  const person = await deliveryPerson(request, env.DB);
  if (!person) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const form = await request.formData(),
      file = form.get('file');
    if (!(file instanceof File) || form.get('consent') !== 'true')
      throw new CommerceError(
        'Ask for consent before taking and uploading the delivery photo.',
      );
    const stop = await env.DB.prepare(
      "SELECT o.id FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id JOIN orders o ON o.id=s.order_id WHERE s.id=? AND b.person_id=? AND o.status='out_for_delivery'",
    )
      .bind(String(form.get('stopId') || ''), person.id)
      .first<{ id: string }>();
    if (!stop)
      throw new CommerceError('Active assigned delivery not found.', 404);
    const contentType = await validateImage(file),
      id = crypto.randomUUID(),
      key = `private/delivery-proof/${stop.id}/${id}`,
      now = new Date().toISOString();
    await env.FILES.put(key, file.stream(), { httpMetadata: { contentType } });
    try {
      await env.DB.prepare(
        'INSERT INTO delivery_proofs (id,order_id,person_id,storage_key,content_type,size,consent_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
      )
        .bind(id, stop.id, person.id, key, contentType, file.size, now, now)
        .run();
    } catch (e) {
      await env.FILES.delete(key);
      throw e;
    }
    return Response.json({ id });
  } catch (e) {
    return safeError(e);
  }
}
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const proof = await env.DB.prepare(
    'SELECT storage_key,content_type FROM delivery_proofs WHERE id=?',
  )
    .bind(id)
    .first<{ storage_key: string; content_type: string }>();
  if (!proof) return new Response('Not found', { status: 404 });
  const object = await env.FILES.get(proof.storage_key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': proof.content_type,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
