import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { DB: {}, FILES: {} } }));

describe('product Admin endpoint authentication', () => {
  let products!: typeof import('@/app/api/admin/products/route');
  let categories!: typeof import('@/app/api/admin/categories/route');
  let finishes!: typeof import('@/app/api/admin/finishes/route');
  let images!: typeof import('@/app/api/admin/product-images/route');
  let bulkImport!: typeof import('@/app/api/admin/products/import/route');

  beforeAll(async () => {
    [products, categories, finishes, images, bulkImport] = await Promise.all([
      import('@/app/api/admin/products/route'),
      import('@/app/api/admin/categories/route'),
      import('@/app/api/admin/finishes/route'),
      import('@/app/api/admin/product-images/route'),
      import('@/app/api/admin/products/import/route'),
    ]);
  });

  it('rejects unauthenticated catalogue reads and mutations', async () => {
    const get = () => new Request('http://local/api/admin/products');
    const post = () =>
      new Request('http://local/api/admin/products', {
        method: 'POST',
        body: '{}',
      });
    expect((await products.GET(get())).status).toBe(401);
    expect((await products.POST(post())).status).toBe(401);
    expect((await products.PATCH(post())).status).toBe(401);
    expect((await categories.GET(get())).status).toBe(401);
    expect((await categories.POST(post())).status).toBe(401);
    expect((await finishes.GET(get())).status).toBe(401);
    expect((await finishes.POST(post())).status).toBe(401);
    expect((await images.POST(post())).status).toBe(401);
    expect((await bulkImport.POST(post())).status).toBe(401);
  });
});
