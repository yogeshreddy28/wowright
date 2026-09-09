import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import {
  isPlausibleOpenAIKey,
  publicAISettings,
} from '@/lib/services/ai-config';
import {
  getAIEncryptionMaster,
  getAIProviderConfig,
} from '@/lib/services/ai-runtime';
import {
  encryptAISecret,
  validateAIEncryptionKey,
} from '@/lib/services/ai-secret-crypto';
import { createD1AIConfigRepository } from '@/lib/services/ai-settings-repository';

const updateSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().trim().min(1).max(100),
  apiKey: z.string().max(512).optional(),
});

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: Request) {
  if (!(await verifyAdmin(request))) return unauthorized();
  return Response.json({
    ...publicAISettings(await getAIProviderConfig()),
    encryptionConfigured: validateAIEncryptionKey(getAIEncryptionMaster()),
  });
}

export async function PUT(request: Request) {
  if (!(await verifyAdmin(request))) return unauthorized();
  try {
    const input = updateSchema.parse(await request.json());
    const candidate = input.apiKey?.trim();
    const newKey = candidate && !/^•+$/.test(candidate) ? candidate : undefined;
    if (newKey && !isPlausibleOpenAIKey(newKey))
      return Response.json(
        { error: 'Enter a valid OpenAI API key.' },
        { status: 400 },
      );
    const repository = createD1AIConfigRepository(env.DB);
    const before = await repository.read();
    const encryptedApiKey = newKey
      ? await encryptAISecret(newKey, getAIEncryptionMaster())
      : undefined;
    await repository.save({
      provider: input.provider,
      model: input.model,
      encryptedApiKey,
      preserveKey: !newKey,
    });
    await repository.audit(
      newKey
        ? before?.encryptedApiKey
          ? 'ai_key_replaced'
          : 'ai_key_configured'
        : 'ai_model_changed',
      {
        provider: input.provider,
        model: input.model,
      },
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: 'Check the provider and model.' },
        { status: 400 },
      );
    if (
      error instanceof Error &&
      error.message === 'AI_SECRET_STORAGE_NOT_CONFIGURED'
    )
      return Response.json(
        { error: 'Secure AI secret storage is not configured.' },
        { status: 503 },
      );
    return Response.json(
      { error: 'AI settings could not be saved.' },
      { status: 500 },
    );
  }
}
