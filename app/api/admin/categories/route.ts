import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { slugifyProduct } from '@/lib/services/product-admin';

const input = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  active: z.boolean().default(true),
});
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    'SELECT c.*,(SELECT COUNT(*) FROM products p WHERE p.category_id=c.id) product_count FROM categories c ORDER BY sort_order,name',
  ).all();
  return Response.json({ categories: result.results });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = input.parse(await request.json()),
      slug = slugifyProduct(data.name),
      now = new Date().toISOString();
    if (
      await env.DB.prepare(
        'SELECT id FROM categories WHERE lower(name)=lower(?) OR slug=?',
      )
        .bind(data.name, slug)
        .first()
    )
      return Response.json(
        { error: 'That category already exists.' },
        { status: 409 },
      );
    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO categories (id,slug,name,description,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,1,(SELECT COALESCE(MAX(sort_order),0)+10 FROM categories),?,?)',
    )
      .bind(id, slug, data.name, data.description || null, now, now)
      .run();
    return Response.json({ id, slug });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not save category.',
      },
      { status: 400 },
    );
  }
}
export async function PATCH(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = input.extend({ id: z.string() }).parse(await request.json()),
      slug = slugifyProduct(data.name);
    const collision = await env.DB.prepare(
      'SELECT id FROM categories WHERE (lower(name)=lower(?) OR slug=?) AND id<>?',
    )
      .bind(data.name, slug, data.id)
      .first();
    if (collision)
      return Response.json(
        { error: 'That category already exists.' },
        { status: 409 },
      );
    await env.DB.prepare(
      'UPDATE categories SET slug=?,name=?,description=?,active=?,updated_at=? WHERE id=?',
    )
      .bind(
        slug,
        data.name,
        data.description || null,
        Number(data.active),
        new Date().toISOString(),
        data.id,
      )
      .run();
    await env.DB.prepare('UPDATE products SET category=? WHERE category_id=?')
      .bind(data.name, data.id)
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update category.',
      },
      { status: 400 },
    );
  }
}
