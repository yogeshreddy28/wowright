import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ env: { DB: {} } }));

describe('AI Admin endpoint authentication', () => {
  let settingsRoute: typeof import('@/app/api/admin/settings/ai/route');
  let testRoute: typeof import('@/app/api/admin/settings/ai/test/route');
  let keyRoute: typeof import('@/app/api/admin/settings/ai/key/route');
  let encryptionStatusRoute: typeof import('@/app/api/admin/settings/ai/encryption-status/route');

  beforeAll(async () => {
    settingsRoute = await import('@/app/api/admin/settings/ai/route');
    testRoute = await import('@/app/api/admin/settings/ai/test/route');
    keyRoute = await import('@/app/api/admin/settings/ai/key/route');
    encryptionStatusRoute =
      await import('@/app/api/admin/settings/ai/encryption-status/route');
  });

  it('rejects unauthenticated reads', async () => {
    const response = await settingsRoute.GET(
      new Request('http://local/api/admin/settings/ai'),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects unauthenticated updates, tests, and removal', async () => {
    const request = () =>
      new Request('http://local/api/admin/settings/ai', {
        method: 'POST',
        body: '{}',
      });
    expect((await settingsRoute.PUT(request())).status).toBe(401);
    expect((await testRoute.POST(request())).status).toBe(401);
    expect((await keyRoute.DELETE(request())).status).toBe(401);
    expect((await encryptionStatusRoute.GET(request())).status).toBe(401);
  });
});
