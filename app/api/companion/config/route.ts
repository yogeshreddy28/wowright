import { env } from 'cloudflare:workers';
const defaults = {
  companionEnabled: true,
  companionProactiveEnabled: true,
  companionExperimentVariant: 'control',
  companionPromptCooldown: 50,
};
export async function GET() {
  try {
    const rows = await env.DB.prepare(
      "SELECT key,value FROM settings WHERE key IN ('companionEnabled','companionProactiveEnabled','companionExperimentVariant','companionPromptCooldown')",
    ).all<{ key: string; value: string }>();
    const saved = Object.fromEntries(
      rows.results.map((x) => [x.key, JSON.parse(x.value)]),
    );
    return Response.json(
      { ...defaults, ...saved },
      { headers: { 'Cache-Control': 'public, max-age=60' } },
    );
  } catch {
    return Response.json(defaults);
  }
}
