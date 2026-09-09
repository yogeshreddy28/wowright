import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { durableRateLimit } from '@/lib/rate-limit';
import { testAIConnection } from '@/lib/services/ai-connection';
import { isPlausibleOpenAIKey } from '@/lib/services/ai-config';
import { getAIProviderConfig } from '@/lib/services/ai-runtime';
import { createD1AIConfigRepository } from '@/lib/services/ai-settings-repository';

const schema = z.object({
  provider: z.literal('openai').optional(),
  model: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().max(512).optional(),
});

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await durableRateLimit(env.DB,'admin:ai-connection-test', 10, 60_000))
    return Response.json({ status: 'rate_limited' }, { status: 429 });
  try {
    const input = schema.parse(await request.json());
    const candidate = input.apiKey?.trim();
    const newKey = candidate && !/^•+$/.test(candidate) ? candidate : undefined;
    if (newKey && !isPlausibleOpenAIKey(newKey))
      return Response.json({ status: 'invalid_api_key' }, { status: 400 });
    const current = await getAIProviderConfig();
    const result = await testAIConnection({
      provider: input.provider || current.provider,
      model: input.model || current.model,
      apiKey: newKey || current.apiKey,
    });
    const testedAt = new Date().toISOString();
    if (!newKey) {
      const repository = createD1AIConfigRepository(env.DB);
      await repository.recordTest(
        result.status === 'connected'
          ? 'connected'
          : current.apiKey
            ? 'connection_error'
            : 'not_configured',
        testedAt,
        current.provider,
        current.model,
      );
      await repository.audit('ai_connection_tested', {
        provider: current.provider,
        model: current.model,
        status: result.status,
      });
    }
    return Response.json({ status: result.status, testedAt });
  } catch {
    return Response.json({ status: 'connection_error' }, { status: 400 });
  }
}
