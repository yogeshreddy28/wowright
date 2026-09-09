import { env } from 'cloudflare:workers';
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;
  const row = await env.DB.prepare(
    "SELECT r.photo_key,r.photo_type FROM reviews r JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id WHERE r.id=? AND r.status='published' AND o.status='delivered' AND o.is_test=0",
  )
    .bind(reviewId)
    .first<{ photo_key: string; photo_type: string }>();
  if (!row?.photo_key) return new Response('Not found', { status: 404 });
  const file = await env.FILES.get(row.photo_key);
  return file
    ? new Response(file.body, {
        headers: {
          'Content-Type': row.photo_type,
          'Cache-Control': 'public,max-age=60',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    : new Response('Not found', { status: 404 });
}
