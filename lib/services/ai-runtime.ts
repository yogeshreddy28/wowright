import { env } from 'cloudflare:workers';
import {
  resolveAIConfig,
  type AIConfigRepository,
  type AIEnvironment,
} from './ai-config';
import { createAIProvider } from './ai';
import { createD1AIConfigRepository } from './ai-settings-repository';

export function getAIRuntimeEnvironment(): AIEnvironment {
  return {
    AI_PROVIDER: env.AI_PROVIDER || process.env.AI_PROVIDER,
    AI_MODEL: env.AI_MODEL || process.env.AI_MODEL,
    OPENAI_API_KEY: env.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    AI_SETTINGS_ENCRYPTION_KEY:
      env.AI_SETTINGS_ENCRYPTION_KEY || process.env.AI_SETTINGS_ENCRYPTION_KEY,
  };
}

export function getAIEncryptionMaster() {
  return getAIRuntimeEnvironment().AI_SETTINGS_ENCRYPTION_KEY;
}

const emptyRepository: AIConfigRepository = { read: async () => null };

export async function getAIProviderConfig() {
  const environment = getAIRuntimeEnvironment();
  try {
    return await resolveAIConfig(
      createD1AIConfigRepository(env.DB),
      environment,
    );
  } catch {
    return resolveAIConfig(emptyRepository, environment);
  }
}

export async function getAIProvider() {
  return createAIProvider(await getAIProviderConfig());
}
