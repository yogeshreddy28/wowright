import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { persist } from '../../route';
import {
  productAdminInput,
  productInputFromRow,
  slugifyProduct,
} from '@/lib/services/product-admin';
const value = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  value: z.string().min(1),
  priceAdjustment: z.number().int().default(0),
  active: z.boolean().default(true),
});
const option = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  type: z.enum(['select', 'radio', 'text', 'textarea', 'number', 'boolean']),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  values: z.array(value).default([]),
});
const variant = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  sku: z.string().min(1),
  priceAdjustment: z.number().int().default(0),
  active: z.boolean().default(true),
});
const productDetails = z.object({
  sku: z.string().max(80).optional(),
  category: z.string().min(1).max(100),
  dimensions: z.string().max(300).optional(),
  material: z.string().max(200).optional(),
  deliveryNotes: z.string().max(500).optional(),
  careInstructions: z.string().max(1000).optional(),
  commercialLicenseStatus: z.string().max(80).optional(),
  status: z.enum(['active', 'draft', 'unavailable']),
  tags: z.array(z.string().max(50)).max(30).default([]),
});
const schema = z.object({
  product: productDetails.optional(),
  images: z.array(z.string().min(1)).max(12),
  finishReferenceImages: z.record(z.string(), z.string().min(1)).default({}),
  relatedProductIds: z.array(z.string()).max(20).default([]),
  options: z.array(option).max(20),
  variants: z.array(variant).max(50),
});
export async function GET(
  r: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { productId } = await params;
  const [product, options, values, variants, related] = await env.DB.batch([
    env.DB.prepare(
      'SELECT sku,category,status,dimensions,material,delivery_notes,care_instructions,commercial_license_status,tags,images,finish_reference_images FROM products WHERE id=?',
    ).bind(productId),
    env.DB.prepare(
      'SELECT * FROM product_options WHERE product_id=? ORDER BY sort_order',
    ).bind(productId),
    env.DB.prepare(
      'SELECT v.* FROM product_option_values v JOIN product_options o ON o.id=v.option_id WHERE o.product_id=? ORDER BY v.sort_order',
    ).bind(productId),
    env.DB.prepare(
      'SELECT * FROM product_variants WHERE product_id=? ORDER BY created_at',
    ).bind(productId),
    env.DB.prepare(
      'SELECT related_product_id FROM related_products WHERE product_id=? ORDER BY sort_order',
    ).bind(productId),
  ]);
  const imageRow = product.results[0] as
    | {
        sku?: string;
        category?: string;
        status?: string;
        dimensions?: string;
        material?: string;
        delivery_notes?: string;
        care_instructions?: string;
        commercial_license_status?: string;
        tags?: string;
        images?: string;
        finish_reference_images?: string;
      }
    | undefined;
  const opts = (options.results as Record<string, unknown>[]).map((o) => ({
    id: o.id,
    name: o.name,
    key: o.key,
    type: o.type,
    required: Boolean(o.required),
    placeholder: o.placeholder || undefined,
    values: (values.results as Record<string, unknown>[])
      .filter((v) => v.option_id === o.id)
      .map((v) => ({
        id: v.id,
        label: v.label,
        value: v.value,
        priceAdjustment: Number(v.price_adjustment),
        active: Boolean(v.active),
      })),
  }));
  return Response.json({
    product: {
      sku: imageRow?.sku || '',
      category: imageRow?.category || '',
      status: imageRow?.status || 'active',
      dimensions: imageRow?.dimensions || '',
      material: imageRow?.material || '',
      deliveryNotes: imageRow?.delivery_notes || '',
      careInstructions: imageRow?.care_instructions || '',
      commercialLicenseStatus: imageRow?.commercial_license_status || '',
      tags: JSON.parse(imageRow?.tags || '[]'),
    },
    images: JSON.parse(imageRow?.images || '[]'),
    finishReferenceImages: JSON.parse(
      imageRow?.finish_reference_images || '{}',
    ),
    relatedProductIds: (
      related.results as { related_product_id: string }[]
    ).map((item) => item.related_product_id),
    options: opts,
    variants: (variants.results as Record<string, unknown>[]).map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      priceAdjustment: Number(v.price_adjustment),
      active: Boolean(v.active),
    })),
  });
}
export async function PUT(
  r: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { productId } = await params,
      d = schema.parse(await r.json()),
      now = new Date().toISOString();
    const row = await env.DB.prepare('SELECT * FROM products WHERE id=?')
      .bind(productId)
      .first<Record<string, unknown>>();
    if (!row)
      return Response.json({ error: 'Product not found.' }, { status: 404 });
    const existingVariants = await env.DB.prepare(
      'SELECT * FROM product_variants WHERE product_id=?',
    )
      .bind(productId)
      .all<Record<string, unknown>>();
    const input = productInputFromRow(
      row,
      existingVariants.results,
      d.relatedProductIds,
    );
    if (d.product) {
      const categories = await env.DB.prepare(
        'SELECT id,name,slug FROM categories WHERE active=1',
      ).all<{ id: string; name: string; slug: string }>();
      const category = categories.results.find(
        (c) =>
          slugifyProduct(c.name) === slugifyProduct(d.product!.category) ||
          c.slug === slugifyProduct(d.product!.category),
      );
      if (!category)
        return Response.json(
          { error: 'Choose an existing category from the product editor.' },
          { status: 422 },
        );
      Object.assign(input, {
        categoryId: category.id,
        sku: d.product.sku || row.sku,
        material: d.product.material,
        dimensionDisplayOverride: d.product.dimensions,
        deliveryNotes: d.product.deliveryNotes,
        careInstructions: d.product.careInstructions,
        commercialLicenseStatus:
          d.product.commercialLicenseStatus || 'unchecked',
        tags: d.product.tags,
        publishingStatus: d.product.status === 'draft' ? 'draft' : 'published',
        availability:
          d.product.status === 'unavailable'
            ? 'temporarily_unavailable'
            : 'available',
      });
    }
    const variants = d.variants.map((v) => {
      const existing = input.variants.find((old) => old.id === v.id);
      return { ...existing, ...v, enabled: v.active };
    });
    const parsed = productAdminInput.parse({
      ...input,
      images: d.images,
      variants,
    });
    if (new Set(d.options.map((o) => o.key)).size !== d.options.length)
      return Response.json(
        { error: 'Each customization must have a unique key.' },
        { status: 422 },
      );
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        'DELETE FROM product_option_values WHERE option_id IN (SELECT id FROM product_options WHERE product_id=?)',
      ).bind(productId),
      env.DB.prepare('DELETE FROM product_options WHERE product_id=?').bind(
        productId,
      ),
      env.DB.prepare(
        'UPDATE products SET finish_reference_images=? WHERE id=?',
      ).bind(JSON.stringify(d.finishReferenceImages), productId),
    ];
    d.options.forEach((o, i) => {
      const optionId = o.id || crypto.randomUUID();
      statements.push(
        env.DB.prepare(
          'INSERT INTO product_options (id,product_id,name,key,type,required,sort_order,placeholder,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        ).bind(
          optionId,
          productId,
          o.name,
          o.key,
          o.type,
          Number(o.required),
          i,
          o.placeholder || null,
          now,
          now,
        ),
      );
      o.values.forEach((v, j) =>
        statements.push(
          env.DB.prepare(
            'INSERT INTO product_option_values (id,option_id,label,value,price_adjustment,active,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
          ).bind(
            v.id || crypto.randomUUID(),
            optionId,
            v.label,
            v.value,
            v.priceAdjustment,
            Number(v.active),
            j,
            now,
            now,
          ),
        ),
      );
    });
    const result = await persist(env.DB, parsed, productId, statements);
    if (result.response) return result.response;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? 'Check the product fields and licence status.'
            : 'Configuration could not be saved. Check unique SKUs and customization values.',
      },
      { status: 400 },
    );
  }
}
