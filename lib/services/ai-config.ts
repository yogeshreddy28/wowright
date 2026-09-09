import { decryptAISecret, type EncryptedAISecret } from './ai-secret-crypto';
export const DEFAULT_AI_PROVIDER = 'openai' as const;
export const DEFAULT_AI_MODEL = 'gpt-5.6-luna';
export type AIConnectionStatus =
  | 'connected'
  | 'configured_not_tested'
  | 'not_configured'
  | 'connection_error';
export type StoredAIProviderConfig = {
  provider: string;
  model: string;
  encryptedApiKey?: EncryptedAISecret;
  connectionStatus: AIConnectionStatus;
  lastTestedAt?: string;
};
export type ResolvedAIConfig = {
  provider: string;
  model: string;
  apiKey?: string;
  source: 'admin' | 'environment' | 'none';
  connectionStatus: AIConnectionStatus;
  lastTestedAt?: string;
};
export type AIConfigRepository = {
  read(): Promise<StoredAIProviderConfig | null>;
};
export type AIEnvironment = {
  AI_PROVIDER?: string;
  AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  AI_SETTINGS_ENCRYPTION_KEY?: string;
};
export async function resolveAIConfig(
  repository: AIConfigRepository,
  environment: AIEnvironment,
): Promise<ResolvedAIConfig> {
  const stored = await repository.read();
  let adminKey: string | undefined;
  if (stored?.encryptedApiKey)
    try {
      adminKey = await decryptAISecret(
        stored.encryptedApiKey,
        environment.AI_SETTINGS_ENCRYPTION_KEY,
      );
    } catch {}
  const envKey = environment.OPENAI_API_KEY?.trim() || undefined;
  const apiKey = adminKey || envKey;
  const storedStatus = stored?.connectionStatus;
  return {
    provider:
      stored?.provider || environment.AI_PROVIDER || DEFAULT_AI_PROVIDER,
    model: stored?.model || environment.AI_MODEL || DEFAULT_AI_MODEL,
    apiKey,
    source: adminKey ? 'admin' : envKey ? 'environment' : 'none',
    connectionStatus:
      apiKey && storedStatus && storedStatus !== 'not_configured'
        ? storedStatus
        : apiKey
          ? 'configured_not_tested'
          : 'not_configured',
    lastTestedAt: stored?.lastTestedAt,
  };
}
export function isPlausibleOpenAIKey(value: string) {
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(value) && value.length <= 512;
}
export function publicAISettings(config: ResolvedAIConfig) {
  return {
    provider: config.provider,
    model: config.model,
    apiKeyConfigured: Boolean(config.apiKey),
    connectionStatus: config.connectionStatus,
    lastTestedAt: config.lastTestedAt || null,
  };
}
const safeAuditKeys = new Set(['provider', 'model', 'source', 'status']);
export function safeAIAuditMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => safeAuditKeys.has(key)),
  );
}
