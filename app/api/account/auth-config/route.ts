import { googleConfigured } from '@/lib/services/google-auth';
import { env } from 'cloudflare:workers';
export async function GET() {
  return Response.json({ googleConfigured: googleConfigured(), emailDeliveryConfigured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM) }, { headers: { 'Cache-Control': 'no-store' } });
}
