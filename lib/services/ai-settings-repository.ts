import type { D1Database } from '@cloudflare/workers-types';
import {
  safeAIAuditMetadata,
  type AIConnectionStatus,
  type AIConfigRepository,
} from './ai-config';
import type { EncryptedAISecret } from './ai-secret-crypto';
type Row = {
  provider: string;
  model: string;
  api_key_ciphertext: string | null;
  api_key_iv: string | null;
  secret_version: number;
  connection_status: AIConnectionStatus;
  last_tested_at: string | null;
};
export function selectEncryptedAIKey(
  existing: EncryptedAISecret | undefined,
  replacement: EncryptedAISecret | undefined,
  preserve: boolean,
) {
  return replacement || (preserve ? existing : undefined);
}
export function createD1AIConfigRepository(
  db: D1Database,
): AIConfigRepository & {
  save(input: {
    provider: string;
    model: string;
    encryptedApiKey?: EncryptedAISecret;
    preserveKey: boolean;
  }): Promise<void>;
  removeKey(): Promise<void>;
  recordTest(
    status: AIConnectionStatus,
    testedAt: string,
    provider: string,
    model: string,
  ): Promise<void>;
  audit(action: string, metadata?: Record<string, unknown>): Promise<void>;
} {
  const repository = {
    async read() {
      const row = await db
        .prepare(
          'SELECT provider,model,api_key_ciphertext,api_key_iv,secret_version,connection_status,last_tested_at FROM ai_provider_settings WHERE id=?',
        )
        .bind('primary')
        .first<Row>();
      if (!row) return null;
      return {
        provider: row.provider,
        model: row.model,
        encryptedApiKey:
          row.api_key_ciphertext && row.api_key_iv
            ? {
                ciphertext: row.api_key_ciphertext,
                iv: row.api_key_iv,
                version: row.secret_version as 1,
              }
            : undefined,
        connectionStatus: row.connection_status,
        lastTestedAt: row.last_tested_at || undefined,
      };
    },
    async save(input: {
      provider: string;
      model: string;
      encryptedApiKey?: EncryptedAISecret;
      preserveKey: boolean;
    }) {
      const existing = await repository.read();
      const envelope = selectEncryptedAIKey(
        existing?.encryptedApiKey,
        input.encryptedApiKey,
        input.preserveKey,
      );
      const status: AIConnectionStatus = envelope
        ? 'configured_not_tested'
        : 'not_configured';
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO ai_provider_settings (id,provider,model,api_key_ciphertext,api_key_iv,secret_version,connection_status,last_tested_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,api_key_ciphertext=excluded.api_key_ciphertext,api_key_iv=excluded.api_key_iv,secret_version=excluded.secret_version,connection_status=excluded.connection_status,last_tested_at=excluded.last_tested_at,updated_at=excluded.updated_at`,
        )
        .bind(
          'primary',
          input.provider,
          input.model,
          envelope?.ciphertext || null,
          envelope?.iv || null,
          envelope?.version || 1,
          status,
          null,
          now,
          now,
        )
        .run();
    },
    async removeKey() {
      const now = new Date().toISOString();
      await db
        .prepare(
          "UPDATE ai_provider_settings SET api_key_ciphertext=NULL,api_key_iv=NULL,connection_status='not_configured',last_tested_at=NULL,updated_at=? WHERE id=?",
        )
        .bind(now, 'primary')
        .run();
    },
    async recordTest(
      status: AIConnectionStatus,
      testedAt: string,
      provider: string,
      model: string,
    ) {
      await db
        .prepare(
          `INSERT INTO ai_provider_settings (id,provider,model,connection_status,last_tested_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET connection_status=excluded.connection_status,last_tested_at=excluded.last_tested_at,updated_at=excluded.updated_at`,
        )
        .bind('primary', provider, model, status, testedAt, testedAt, testedAt)
        .run();
    },
    async audit(action: string, metadata: Record<string, unknown> = {}) {
      await db
        .prepare(
          'INSERT INTO admin_audit_events (id,action,metadata,created_at) VALUES (?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          action,
          JSON.stringify(safeAIAuditMetadata(metadata)),
          new Date().toISOString(),
        )
        .run();
    },
  };
  return repository;
}
