import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import {
  productAdminInput,
  productInputFromRow,
} from '@/lib/services/product-admin';
const bindings = vi.hoisted(() => ({
  DB: {} as D1Database,
  FILES: { put: vi.fn(), delete: vi.fn() },
}));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdmin: async (r: Request) =>
    r.headers.get('x-isolated-test-admin') === 'yes',
}));
import { persist } from '@/app/api/admin/products/route';
import { PATCH as updateProduct } from '@/app/api/admin/products/route';
import { POST as duplicate } from '@/app/api/admin/products/[productId]/duplicate/route';
import { PUT as configure } from '@/app/api/admin/products/[productId]/configuration/route';
import {
  POST as upload,
  DELETE as removeImage,
} from '@/app/api/admin/product-images/route';
import { POST as bulkImport } from '@/app/api/admin/products/import/route';
let database: ReturnType<typeof testDatabase>;
const input = () =>
  productAdminInput.parse({
    name: 'Isolated fixture',
    categoryId: 'cat_home_decor',
    basePrice: 599,
    images: ['/isolated-test.jpg'],
    variants: [{ name: 'Test finish', sellingPrice: 649 }],
  });
const req = (path: string, body: unknown, method: 'POST' | 'PUT' = 'POST') =>
  new Request('http://local' + path, {
    method,
    headers: {
      'x-isolated-test-admin': 'yes',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  database = testDatabase();
  bindings.DB = database.db;
  vi.clearAllMocks();
});
afterEach(() => database.sqlite.close());
it('blocks unverified publish without partially creating a product', async () => {
  const result = await persist(bindings.DB, {
    ...input(),
    publishingStatus: 'published',
  });
  expect(result.response?.status).toBe(422);
  expect(
    database.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,
  ).toBe(0);
});
it('publishes with verified licence/main image, and preserves referenced finish IDs on edits', async () => {
  const result = await persist(bindings.DB, {
    ...input(),
    commercialLicenseStatus: 'commercial_verified',
    publishingStatus: 'published',
  });
  expect(result.id).toBeTruthy();
  const row = database.sqlite
    .prepare('SELECT * FROM products WHERE id=?')
    .get(result.id!)!;
  const variants = database.sqlite
    .prepare('SELECT * FROM product_variants WHERE product_id=?')
    .all(result.id!);
  const updated = productAdminInput.parse(productInputFromRow(row, variants));
  await persist(
    bindings.DB,
    { ...updated, name: 'Updated fixture' },
    result.id,
  );
  expect(
    database.sqlite
      .prepare('SELECT id FROM product_variants WHERE product_id=?')
      .get(result.id!)?.id,
  ).toBe(variants[0].id);
  expect(
    database.sqlite
      .prepare('SELECT publishing_status FROM products WHERE id=?')
      .get(result.id!)?.publishing_status,
  ).toBe('published');
});
it('validates and persists universal finish associations with multiple product photos', async () => {
  const source = await persist(bindings.DB, input());
  const variant = database.sqlite
    .prepare('SELECT * FROM product_variants WHERE product_id=?')
    .get(source.id!)!;
  database.sqlite.exec(
    "INSERT INTO global_finishes(id,slug,name,active) VALUES('finish-test-obsidian','test-obsidian','Test Obsidian',1)",
  );
  database.sqlite
    .prepare(
      "INSERT INTO product_images(id,product_id,storage_key,original_name,content_type,size,role) VALUES('photo-one',?,'one','one.webp','image/webp',12,'gallery'),('photo-two',?,'two','two.webp','image/webp',12,'gallery')",
    )
    .run(source.id!, source.id!);
  const row = database.sqlite
    .prepare('SELECT * FROM products WHERE id=?')
    .get(source.id!)!;
  const updated = productAdminInput.parse(
    productInputFromRow(row, [
      {
        ...variant,
        finish_id: 'finish-test-obsidian',
        exact_image_ids: ['photo-one', 'photo-two'],
      },
    ]),
  );
  await persist(bindings.DB, updated, source.id);
  expect(
    database.sqlite
      .prepare(
        'SELECT image_id FROM product_variant_images WHERE variant_id=? ORDER BY sort_order',
      )
      .all(variant.id)
      .map((item) => item.image_id),
  ).toEqual(['photo-one', 'photo-two']);
  await expect(
    persist(
      bindings.DB,
      {
        ...updated,
        variants: [{ ...updated.variants[0], finishId: 'missing-finish' }],
      },
      source.id,
    ),
  ).rejects.toThrow('Invalid global finish');
});
it('rolls back the complete product when relation persistence fails', async () => {
  await expect(
    persist(bindings.DB, {
      ...input(),
      variants: [
        { ...input().variants[0], sku: 'DUP' },
        { ...input().variants[0], sku: 'DUP' },
      ],
    }),
  ).rejects.toThrow();
  expect(
    database.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,
  ).toBe(0);
});
it('preserves variant identity and SKU when a stale editor resubmits universal finishes', async () => {
  database.sqlite.exec(
    "INSERT INTO global_finishes(id,slug,name,active) VALUES('finish-test-black','test-black','Test Black',1),('finish-test-copper','test-copper','Test Copper',1),('finish-test-white','test-white','Test White',1)",
  );
  const stale = productAdminInput.parse({
    ...input(),
    variants: [
      { name: 'Test Black', finishId: 'finish-test-black', sellingPrice: 599 },
      { name: 'Test Copper', finishId: 'finish-test-copper', sellingPrice: 649 },
    ],
  });
  const source = await persist(bindings.DB, stale);
  const before = database.sqlite
    .prepare(
      'SELECT id,finish_id,sku FROM product_variants WHERE product_id=? ORDER BY sort_order',
    )
    .all(source.id!) as { id: string; finish_id: string; sku: string }[];
  await persist(
    bindings.DB,
    productAdminInput.parse({
      ...stale,
      variants: [
        ...stale.variants,
        { name: 'Test White', finishId: 'finish-test-white', sellingPrice: 629 },
      ],
    }),
    source.id,
  );
  const after = database.sqlite
    .prepare(
      'SELECT id,finish_id,sku FROM product_variants WHERE product_id=? ORDER BY sort_order',
    )
    .all(source.id!) as { id: string; finish_id: string; sku: string }[];
  expect(after).toHaveLength(3);
  expect(after.slice(0, 2)).toEqual(before);
  expect(after[2]?.sku).toBe(`${source.sku}-03`);
});
it('rejects a duplicate variant SKU before D1 with the owning product and finish', async () => {
  const source = await persist(
    bindings.DB,
    productAdminInput.parse({
      ...input(),
      name: 'First fixture',
      variants: [{ name: 'Black', sku: 'WR-SHARED-01', sellingPrice: 599 }],
    }),
  );
  const response = await updateProduct(
    new Request('http://local/api/admin/products', {
      method: 'PATCH',
      headers: {
        'x-isolated-test-admin': 'yes',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...input(),
        id: source.id,
        name: 'First fixture',
        variants: [
          { name: 'Copper', sku: 'WR-SHARED-01', sellingPrice: 649 },
        ],
      }),
    }),
  );
  const body = (await response.json()) as { error: string };
  expect(response.status).toBe(400);
  expect(body.error).toBe(
    'SKU WR-SHARED-01 is already used by First fixture / Black. Choose another SKU.',
  );
  expect(
    database.sqlite
      .prepare('SELECT COUNT(*) n FROM product_variants WHERE product_id=?')
      .get(source.id!)?.n,
  ).toBe(1);
});
it('duplicates options, prices and safe image references as a new draft', async () => {
  const source = await persist(bindings.DB, {
    ...input(),
    internalUnitCost: 100,
  });
  database.sqlite
    .prepare(
      "INSERT INTO product_options(id,product_id,name,key,type,required) VALUES('option',?,'Text','text','text',1)",
    )
    .run(source.id!);
  const response = await duplicate(req('/duplicate', { copyImages: true }), {
    params: Promise.resolve({ productId: source.id! }),
  });
  const copy = (await response.json()) as any;
  expect(response.status).toBe(200);
  const row = database.sqlite
    .prepare('SELECT * FROM products WHERE id=?')
    .get(copy.id)!;
  expect(row.sku).not.toBe(source.sku);
  expect(row.slug).not.toBe(source.slug);
  expect(row.publishing_status).toBe('draft');
  expect(row.internal_unit_cost).toBe(100);
  expect(JSON.parse(String(row.images))).toEqual(['/isolated-test.jpg']);
  expect(
    database.sqlite
      .prepare('SELECT COUNT(*) n FROM product_options WHERE product_id=?')
      .get(copy.id)?.n,
  ).toBe(1);
});
it('legacy configuration cannot bypass licence protection', async () => {
  const source = await persist(bindings.DB, input());
  const response = await configure(
    req(
      '/configuration',
      {
        product: {
          category: 'Home Decor',
          status: 'active',
          commercialLicenseStatus: 'unchecked',
        },
        images: ['/isolated-test.jpg'],
        options: [],
        variants: [],
      },
      'PUT',
    ),
    { params: Promise.resolve({ productId: source.id! }) },
  );
  expect(response.status).toBe(422);
  expect(
    database.sqlite
      .prepare('SELECT publishing_status FROM products WHERE id=?')
      .get(source.id!)?.publishing_status,
  ).toBe('draft');
});
it('rejects spoofed image content before object storage and protects main images', async () => {
  const source = await persist(bindings.DB, input());
  const form = new FormData();
  form.set('productId', source.id!);
  form.set(
    'file',
    new File(['not an image'], 'fake.png', { type: 'image/png' }),
  );
  const response = await upload(
    new Request('http://local/upload', {
      method: 'POST',
      headers: { 'x-isolated-test-admin': 'yes' },
      body: form,
    }),
  );
  expect(response.status).toBe(400);
  expect(bindings.FILES.put).not.toHaveBeenCalled();
  database.sqlite
    .prepare(
      "INSERT INTO product_images(id,product_id,storage_key,original_name,content_type,size,role) VALUES('image',?,'isolated','isolated.png','image/png',16,'main')",
    )
    .run(source.id!);
  database.sqlite
    .prepare(
      "UPDATE products SET images='[]',publishing_status='published',commercial_license_status='commercial_verified' WHERE id=?",
    )
    .run(source.id!);
  const removed = await removeImage(
    new Request('http://local/images?id=image', {
      method: 'DELETE',
      headers: { 'x-isolated-test-admin': 'yes' },
    }),
  );
  expect(removed.status).toBe(409);
});
it('bulk dry-run has no writes and duplicate slugs reject the entire commit', async () => {
  const content = JSON.stringify([
    { name: 'Isolated import', category: 'Home Decor', selling_price: 599 },
  ]);
  const dry = await bulkImport(
    req('/import', { mode: 'dry-run', format: 'json', content }),
  );
  expect(dry.status).toBe(200);
  expect(
    database.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,
  ).toBe(0);
  const committed = await bulkImport(
    req('/import', { mode: 'commit', format: 'json', content }),
  );
  expect(committed.status).toBe(200);
  const repeated = await bulkImport(
    req('/import', { mode: 'commit', format: 'json', content }),
  );
  expect(repeated.status).toBe(422);
  expect(
    database.sqlite.prepare('SELECT COUNT(*) n FROM products').get()?.n,
  ).toBe(1);
});
