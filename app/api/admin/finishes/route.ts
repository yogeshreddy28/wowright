import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { slugifyProduct } from '@/lib/services/product-admin';

const input = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  swatch: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .or(z.literal('')),
  internalNotes: z.string().trim().max(500).optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10000).optional(),
});
export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await env.DB.prepare(
    "SELECT f.*,COALESCE(CASE WHEN f.reference_image_id IS NOT NULL THEN '/api/product-images/'||f.reference_image_id END,(SELECT '/api/product-images/'||i.id FROM product_images i WHERE i.global_finish_id=f.id ORDER BY i.sort_order LIMIT 1)) reference_image FROM global_finishes f ORDER BY sort_order,name",
  ).all();
  return Response.json({ finishes: result.results });
}
export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const data = input.parse(await request.json()),
      slug = data.slug || slugifyProduct(data.name),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    if (
      await env.DB.prepare(
        'SELECT id FROM global_finishes WHERE lower(name)=lower(?) OR slug=?',
      )
        .bind(data.name, slug)
        .first()
    )
      return Response.json(
        { error: 'That finish already exists.' },
        { status: 409 },
      );
    await env.DB.prepare(
      'INSERT INTO global_finishes (id,slug,name,swatch,active,internal_notes,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,COALESCE(?,(SELECT COALESCE(MAX(sort_order),0)+10 FROM global_finishes)),?,?)',
    )
      .bind(
        id,
        slug,
        data.name,
        data.swatch || null,
        Number(data.active),
        data.internalNotes || null,
        data.sortOrder ?? null,
        now,
        now,
      )
      .run();
    return Response.json({ id, slug });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not save finish.',
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
      slug = data.slug || slugifyProduct(data.name);
    const collision = await env.DB.prepare(
      'SELECT id FROM global_finishes WHERE (lower(name)=lower(?) OR slug=?) AND id<>?',
    )
      .bind(data.name, slug, data.id)
      .first();
    if (collision)
      return Response.json(
        { error: 'That finish already exists.' },
        { status: 409 },
      );
    await env.DB.prepare(
      'UPDATE global_finishes SET slug=?,name=?,swatch=?,active=?,internal_notes=?,sort_order=COALESCE(?,sort_order),updated_at=? WHERE id=?',
    )
      .bind(
        slug,
        data.name,
        data.swatch || null,
        Number(data.active),
        data.internalNotes || null,
        data.sortOrder ?? null,
        new Date().toISOString(),
        data.id,
      )
      .run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : 'Could not update finish.',
      },
      { status: 400 },
    );
  }
}
