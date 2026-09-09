import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import {
  CommerceError,
  safeError,
  sameOrigin,
} from '@/lib/services/launch-rules';
import { validateImage } from '@/lib/services/image-upload';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('productId');
  if (!id) return Response.json({ reviews: [] });
  const [result, totals] = await env.DB.batch([
    env.DB.prepare("SELECT r.id,r.rating,r.body,r.created_at,substr(c.name,1,1)||'•••' customer_name,CASE WHEN r.photo_key IS NOT NULL THEN '/api/reviews/photo/'||r.id ELSE NULL END photo FROM reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id JOIN customers c ON c.id=r.customer_id WHERE r.product_id=? AND r.status='published' AND o.status='delivered' AND o.is_test=0 ORDER BY r.created_at DESC LIMIT 50").bind(id),
    env.DB.prepare("SELECT r.rating,COUNT(*) count FROM reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE r.product_id=? AND r.status='published' AND o.status='delivered' AND o.is_test=0 GROUP BY r.rating").bind(id),
  ]);
  const reviews = result.results as { rating: number }[];
  const distribution = Object.fromEntries([5,4,3,2,1].map((rating) => [rating, Number((totals.results as { rating: number; count: number }[]).find((row) => Number(row.rating) === rating)?.count || 0)]));
  const count = Object.values(distribution).reduce((sum, value) => sum + value, 0);
  const average = count ? Object.entries(distribution).reduce((sum, [rating, value]) => sum + Number(rating) * value, 0) / count : 0;
  return Response.json({ reviews, summary: { count, average, distribution } });
}
export async function POST(request: Request) {
  const account = await getCustomerFromRequest(request, env.DB);
  if (!account)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let key: string | null = null;
  try {
    sameOrigin(request);
    const form = await request.formData(),
      data = z
        .object({
          orderItemId: z.string(),
          rating: z.coerce.number().int().min(1).max(5),
          body: z.string().trim().min(3).max(2000),
        })
        .parse(Object.fromEntries(form));
    const item = await env.DB.prepare(
      "SELECT i.id,i.product_id FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=? AND o.customer_id=? AND o.status='delivered'",
    )
      .bind(data.orderItemId, account.id)
      .first<{ id: string; product_id: string }>();
    if (!item)
      throw new CommerceError(
        'Reviews are available only for your delivered purchases.',
        403,
      );
    const id = crypto.randomUUID(),
      photo = form.get('photo');
    let type: string | null = null;
    if (photo instanceof File && photo.size) {
      if (form.get('photoConsent') !== 'on')
        throw new CommerceError(
          'Confirm that you have permission to publish this photo.',
        );
      type = await validateImage(photo);
      key = `reviews/${id}`;
      await env.FILES.put(key, photo.stream(), {
        httpMetadata: { contentType: type },
      });
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO reviews(id,order_item_id,customer_id,product_id,rating,body,photo_key,photo_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        id,
        item.id,
        account.id,
        item.product_id,
        data.rating,
        data.body,
        key,
        type,
        now,
        now,
      )
      .run();
    return Response.json({ id });
  } catch (e) {
    if (key) await env.FILES.delete(key);
    return safeError(
      e,
      'Could not save the review. Each purchased line can be reviewed once.',
    );
  }
}
