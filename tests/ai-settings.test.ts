import { describe, expect, it, vi } from 'vitest';
import { createAIProvider } from '@/lib/services/ai';
import { testAIConnection } from '@/lib/services/ai-connection';
import {
  DEFAULT_AI_MODEL,
  publicAISettings,
  resolveAIConfig,
  safeAIAuditMetadata,
  type StoredAIProviderConfig,
} from '@/lib/services/ai-config';
import {
  decryptAISecret,
  encryptAISecret,
} from '@/lib/services/ai-secret-crypto';
import { selectEncryptedAIKey } from '@/lib/services/ai-settings-repository';

const master = Buffer.alloc(32, 7).toString('base64');
const testKey = ['sk', 'test', 'mock', 'x'.repeat(24)].join('-');
const environmentKey = ['sk', 'env', 'mock', 'y'.repeat(24)].join('-');
const repository = (value: StoredAIProviderConfig | null) => ({
  read: async () => value,
});

describe('secure AI settings', () => {
  it('encrypts before persistence and decrypts only server-side', async () => {
    const envelope = await encryptAISecret(testKey, master);
    expect(JSON.stringify(envelope)).not.toContain(testKey);
    expect(await decryptAISecret(envelope, master)).toBe(testKey);
  });
  it('persists ciphertext and never the plaintext credential', async () => {
    let written: unknown[] = [];
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              first: async () => null,
              run: async () => {
                if (sql.startsWith('INSERT INTO ai_provider_settings'))
                  written = values;
              },
            };
          },
        };
      },
    };
    const { createD1AIConfigRepository } =
      await import('@/lib/services/ai-settings-repository');
    const envelope = await encryptAISecret(testKey, master);
    await createD1AIConfigRepository(db as never).save({
      provider: 'openai',
      model: DEFAULT_AI_MODEL,
      encryptedApiKey: envelope,
      preserveKey: false,
    });
    expect(JSON.stringify(written)).not.toContain(testKey);
    expect(written[3]).toBe(envelope.ciphertext);
    expect(written[4]).toBe(envelope.iv);
  });
  it('rejects encryption when secure storage is not configured', async () => {
    await expect(encryptAISecret(testKey, undefined)).rejects.toThrow(
      'AI_SECRET_STORAGE_NOT_CONFIGURED',
    );
  });
  it('uses the environment key as fallback', async () => {
    const resolved = await resolveAIConfig(repository(null), {
      OPENAI_API_KEY: environmentKey,
    });
    expect(resolved.source).toBe('environment');
    expect(resolved.apiKey).toBe(environmentKey);
    expect(resolved.model).toBe(DEFAULT_AI_MODEL);
  });
  it('admin key and model override environment configuration', async () => {
    const envelope = await encryptAISecret(testKey, master);
    const resolved = await resolveAIConfig(
      repository({
        provider: 'openai',
        model: 'admin-model',
        encryptedApiKey: envelope,
        connectionStatus: 'connected',
      }),
      {
        OPENAI_API_KEY: environmentKey,
        AI_MODEL: 'environment-model',
        AI_SETTINGS_ENCRYPTION_KEY: master,
      },
    );
    expect(resolved.source).toBe('admin');
    expect(resolved.apiKey).toBe(testKey);
    expect(resolved.model).toBe('admin-model');
  });
  it('changing model or sending a blank key preserves the encrypted key', async () => {
    const envelope = await encryptAISecret(testKey, master);
    expect(selectEncryptedAIKey(envelope, undefined, true)).toBe(envelope);
  });
  it('explicit removal discards the stored key', async () => {
    const envelope = await encryptAISecret(testKey, master);
    expect(selectEncryptedAIKey(envelope, undefined, false)).toBeUndefined();
  });
  it('safe GET representation never contains an API key', () => {
    const json = JSON.stringify(
      publicAISettings({
        provider: 'openai',
        model: DEFAULT_AI_MODEL,
        apiKey: testKey,
        source: 'admin',
        connectionStatus: 'connected',
      }),
    );
    expect(json).not.toContain(testKey);
    expect(json).not.toContain('"apiKey"');
    expect(json).toContain('apiKeyConfigured');
  });
  it('audit metadata drops key-shaped and arbitrary values', () => {
    const metadata = safeAIAuditMetadata({
      provider: 'openai',
      model: DEFAULT_AI_MODEL,
      apiKey: testKey,
      message: testKey,
    });
    expect(JSON.stringify(metadata)).not.toContain(testKey);
    expect(metadata).toEqual({ provider: 'openai', model: DEFAULT_AI_MODEL });
  });
  it.each([
    [200, 'connected'],
    [401, 'invalid_api_key'],
    [404, 'model_unavailable'],
    [429, 'rate_limited'],
  ] as const)(
    'classifies provider status %s safely',
    async (code, expected) => {
      const fetcher = vi.fn(
        async () => new Response('', { status: code }),
      ) as unknown as typeof fetch;
      expect(
        (
          await testAIConnection(
            { provider: 'openai', model: DEFAULT_AI_MODEL, apiKey: testKey },
            fetcher,
          )
        ).status,
      ).toBe(expected);
    },
  );
  it('does not leak a key from provider failures', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`network failed ${testKey}`);
    }) as unknown as typeof fetch;
    const provider = createAIProvider(
      { provider: 'openai', model: DEFAULT_AI_MODEL, apiKey: testKey },
      fetcher,
    );
    try {
      await provider.generate({ message: 'help', context: {} });
    } catch (error) {
      expect(String(error)).not.toContain(testKey);
    }
    expect(
      (
        await testAIConnection(
          { provider: 'openai', model: DEFAULT_AI_MODEL, apiKey: testKey },
          fetcher,
        )
      ).status,
    ).toBe('network_error');
  });
  it('activates generated answers when a resolved key is available', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ output_text: 'A mocked WOW answer.' }),
    ) as unknown as typeof fetch;
    const provider = createAIProvider(
      { provider: 'openai', model: DEFAULT_AI_MODEL, apiKey: testKey },
      fetcher,
    );
    expect(await provider.generate({ message: 'help', context: {} })).toBe(
      'A mocked WOW answer.',
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
