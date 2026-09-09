import type { ResolvedAIConfig } from './ai-config';

export type AIConnectionTestStatus =
  | 'connected'
  | 'not_configured'
  | 'invalid_api_key'
  | 'model_unavailable'
  | 'rate_limited'
  | 'network_error'
  | 'connection_error';

export async function testAIConnection(
  config: Pick<ResolvedAIConfig, 'provider' | 'model' | 'apiKey'>,
  fetcher: typeof fetch = fetch,
): Promise<{ status: AIConnectionTestStatus }> {
  if (!config.apiKey) return { status: 'not_configured' };
  if (config.provider !== 'openai') return { status: 'connection_error' };
  try {
    const response = await fetcher(
      `https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );
    if (response.ok) return { status: 'connected' };
    if (response.status === 401 || response.status === 403)
      return { status: 'invalid_api_key' };
    if (response.status === 404) return { status: 'model_unavailable' };
    if (response.status === 429) return { status: 'rate_limited' };
    return { status: 'connection_error' };
  } catch {
    return { status: 'network_error' };
  }
}
