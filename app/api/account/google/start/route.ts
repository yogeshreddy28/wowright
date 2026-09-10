import { env } from 'cloudflare:workers';
import { createGoogleAuthorization, oauthCookie } from '@/lib/services/google-auth';
export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get('returnTo');
    const returnTo = requested === '/checkout' ? '/checkout' : '/account';
    const auth = await createGoogleAuthorization(env.DB, returnTo);
    return new Response(null, { status: 302, headers: { Location: auth.url, 'Set-Cookie': oauthCookie(auth.state) } });
  } catch {
    return Response.redirect(new URL('/account?authError=google_unavailable', request.url), 302);
  }
}
