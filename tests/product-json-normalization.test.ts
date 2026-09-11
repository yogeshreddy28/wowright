import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import {
  canonicalProductJson,
  loadProductJsonState,
  normalizeProductJson,
  productAdminInput,
  type ProductJsonState,
} from '@/lib/services/product-admin';

const bindings = vi.hoisted(() => ({ DB: {} as D1Database }));
vi.mock('cloudflare:workers', () => ({ env: bindings }));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdmin: async (request: Request) =>
    request.headers.get('x-isolated-test-admin') === 'yes',
}));

import { persist } from '@/app/api/admin/products/route';
import {
  GET as exportJson,
  PUT as importJson,
} from '@/app/api/admin/products/[productId]/json/route';

let database: ReturnType<typeof testDatabase>;
const existingState = (): ProductJsonState => ({
  input: productAdminInput.parse({
    name: 'Schema fixture',
    categoryId: 'cat_home_decor',
    slug: 'schema-fixture',
    sku: 'WR-HOME-090',
    shortDescription: 'Saved short description',
    description: 'Saved description',
    basePrice: 599,
    material: 'PLA',
    width: 10,
    height: 20,
    leadTime: 'Configured lead time',
    deliveryNotes: 'Saved delivery notes',
    seoTitle: 'Saved SEO title',
    seoDescription: 'Saved SEO description',
    publishingStatus: 'draft',
    availability: 'available',
    featured: true,
    tags: ['decor', 'gift'],
    relatedProductIds: ['related-one'],
    variants: [
      {
        id: 'variant-black',
        finishId: 'finish-black',
        name: 'Premium Black',
        sku: 'WR-HOME-090-01',
        sellingPrice: 649,
        enabled: true,
        exactImageIds: ['gallery-black'],
      },
      {
        id: 'variant-copper',
        finishId: 'finish-copper',
        name: 'Copper Silky',
        sku: 'WR-HOME-090-02',
        sellingPrice: 699,
        enabled: true,
      },
    ],
  }),
  images: {
    main: { id: 'main-image', role: 'main', altText: 'Main', sortOrder: 0 },
    gallery: [
      {
        id: 'gallery-black',
        role: 'gallery',
        altText: 'Black view',
        sortOrder: 1,
      },
    ],
    legacyPaths: ['/demo-products/schema-fixture.webp'],
  },
});

beforeEach(() => {
  database = testDatabase();
  bindings.DB = database.db;
});
afterEach(() => database.sqlite.close());

describe('schema-driven Product JSON', () => {
  it('accepts a full canonical document without changing it', () => {
    const state = existingState();
    const full = canonicalProductJson(state);
    const result = normalizeProductJson(full, state);
    expect(result.changedFields).toEqual([]);
    expect(result.document).toEqual(full);
  });

  it('merges a partial document and preserves every omitted saved section', () => {
    const state = existingState();
    const result = normalizeProductJson(
      { name: 'New Name', basePrice: 399 },
      state,
    );
    expect(result.document).toMatchObject({
      name: 'New Name',
      basePrice: 399,
      categoryId: 'cat_home_decor',
      sku: 'WR-HOME-090',
      seoDescription: 'Saved SEO description',
      images: state.images,
    });
    expect(result.input.variants).toEqual(state.input.variants);
    expect(result.changedFields).toEqual(['name', 'basePrice']);
  });

  it('preserves omitted variants, finishes and finish-specific image links', () => {
    const state = existingState();
    const result = normalizeProductJson({ description: 'Changed' }, state);
    expect(result.input.variants).toEqual(state.input.variants);
    expect(result.input.variants[0].exactImageIds).toEqual(['gallery-black']);
  });

  it('preserves uploaded media when omitted or altered in JSON', () => {
    const state = existingState();
    expect(
      normalizeProductJson({ material: 'PLA+' }, state).document.images,
    ).toEqual(state.images);
    const changed = normalizeProductJson(
      { images: { main: null, gallery: [] } },
      state,
    );
    expect(changed.document.images).toEqual(state.images);
    expect(changed.warnings.join(' ')).toContain('Images tab');
  });

  it('ignores an invented GPT field with a precise warning', () => {
    const result = normalizeProductJson(
      { name: 'Valid edit', finishColourCode: '#000000' },
      existingState(),
    );
    expect(result.input.name).toBe('Valid edit');
    expect(result.warnings).toEqual([
      'Unknown field "finishColourCode" was ignored because it is not part of the Product schema.',
    ]);
    expect(result.document).not.toHaveProperty('finishColourCode');
  });

  it('normalizes random input order into the canonical field order', () => {
    const result = normalizeProductJson(
      { featured: false, basePrice: 499, name: 'Ordered' },
      existingState(),
    );
    expect(Object.keys(result.document).slice(0, 6)).toEqual([
      'name',
      'categoryId',
      'slug',
      'sku',
      'shortDescription',
      'description',
    ]);
  });

  it('honours an explicit empty string for a clearable field', () => {
    const result = normalizeProductJson(
      { seoDescription: '' },
      existingState(),
    );
    expect(result.input.seoDescription).toBe('');
    expect(result.changedFields).toEqual(['seoDescription']);
  });

  it('honours supported empty arrays and protects variant history', () => {
    const result = normalizeProductJson(
      { tags: [], relatedProductIds: [], variants: [] },
      existingState(),
    );
    expect(result.input.tags).toEqual([]);
    expect(result.input.relatedProductIds).toEqual([]);
    expect(result.input.variants).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('cannot be removed in bulk');
  });

  it('reports malformed enums with their schema field path', () => {
    expect(() =>
      normalizeProductJson({ availability: 'maybe later' }, existingState()),
    ).toThrow();
    try {
      normalizeProductJson({ availability: 'maybe later' }, existingState());
    } catch (error) {
      expect(
        (error as { issues: { path: PropertyKey[] }[] }).issues[0].path,
      ).toEqual(['availability']);
    }
  });

  it('normalizes friendly enum labels when they are unambiguous', () => {
    const result = normalizeProductJson(
      {
        availability: 'Temporarily unavailable',
        stockMode: 'Made to order',
        commercialLicenseStatus: 'Commercial use verified',
      },
      existingState(),
    );
    expect(result.input).toMatchObject({
      availability: 'temporarily_unavailable',
      stockMode: 'made_to_order',
      commercialLicenseStatus: 'commercial_verified',
    });
  });

  it('matches existing variants without pasted IDs or SKUs', () => {
    const state = existingState();
    const result = normalizeProductJson(
      {
        variants: [
          {
            finishId: 'finish-black',
            name: 'Premium Black',
            sellingPrice: 679,
          },
          { name: 'Copper Silky', sellingPrice: 729 },
        ],
      },
      state,
    );
    expect(result.input.variants.map(({ id, sku }) => ({ id, sku }))).toEqual(
      state.input.variants.map(({ id, sku }) => ({ id, sku })),
    );
    expect(
      result.input.variants.map((variant) => variant.sellingPrice),
    ).toEqual([679, 729]);
    expect(result.input.variants[0].exactImageIds).toEqual(['gallery-black']);
    expect(result.input.variants[0].enabled).toBe(true);
  });

  it('uses schema defaults for fields missing from old saved records', () => {
    const state = existingState();
    state.input = productAdminInput.parse({
      name: state.input.name,
      categoryId: state.input.categoryId,
      slug: state.input.slug,
      sku: state.input.sku,
    });
    const result = normalizeProductJson({ name: 'Defaulted' }, state);
    expect(result.document).toMatchObject({
      stockMode: 'made_to_order',
      publishingStatus: 'draft',
      availability: 'available',
      featured: false,
      tags: [],
      variants: [],
    });
  });

  it('save, reload and repeated save remain canonical and idempotent', async () => {
    const created = await persist(
      bindings.DB,
      productAdminInput.parse({
        name: 'Route fixture',
        categoryId: 'cat_home_decor',
        basePrice: 599,
        tags: ['fixture'],
        variants: [{ name: 'Default', sellingPrice: 649 }],
      }),
    );
    database.sqlite
      .prepare(
        "INSERT INTO product_images(id,product_id,storage_key,original_name,content_type,size,role,alt_text,sort_order) VALUES('json-main',?,'json-main','main.webp','image/webp',12,'main','Main',0)",
      )
      .run(created.id!);
    const context = { params: Promise.resolve({ productId: created.id! }) };
    const headers = {
      'x-isolated-test-admin': 'yes',
      origin: 'http://local',
      'content-type': 'application/json',
    };
    const preview = await importJson(
      new Request('http://local/api/admin/products/id/json', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          mode: 'preview',
          product: { name: 'Route renamed' },
        }),
      }),
      context,
    );
    const normalized = (await preview.json()) as any;
    expect(preview.status).toBe(200);
    expect(normalized.product).toMatchObject({
      name: 'Route renamed',
      categoryId: 'cat_home_decor',
      tags: ['fixture'],
    });
    expect(normalized.product.images.main.id).toBe('json-main');

    const saved = await importJson(
      new Request('http://local/api/admin/products/id/json', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          mode: 'save',
          product: { name: 'Route renamed' },
        }),
      }),
      context,
    );
    const savedBody = (await saved.json()) as any;
    expect(saved.status).toBe(200);
    const exported = await exportJson(
      new Request('http://local/api/admin/products/id/json', { headers }),
      context,
    );
    const exportedBody = (await exported.json()) as any;
    expect(exportedBody.product).toEqual(savedBody.product);

    const repeated = normalizeProductJson(
      exportedBody.product,
      (await loadProductJsonState(bindings.DB, created.id!))!,
    );
    expect(repeated.changedFields).toEqual([]);
    expect(repeated.document).toEqual(exportedBody.product);
  });
});
