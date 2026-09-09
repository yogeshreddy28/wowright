import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { createAdminToken, secureCookie } from '@/lib/admin-auth';
import { durableRateLimit } from '@/lib/rate-limit';
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export async function POST(r: Request) {
  const ip = r.headers.get('cf-connecting-ip') || 'local';
  if (!(await durableRateLimit(env.DB, `admin-login:${ip}`, 5, 15 * 60_000)))
    return Response.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429 },
    );
  try {
    const d = schema.parse(await r.json());
    const email = process.env.ADMIN_EMAIL,
      password = process.env.ADMIN_PASSWORD;
    if (!email || !password)
      return Response.json(
        { error: 'Admin credentials are not configured.' },
        { status: 503 },
      );
    if (
      d.email.toLowerCase() !== email.toLowerCase() ||
      d.password !== password
    ) {
      await new Promise((x) => setTimeout(x, 400));
      return Response.json(
        { error: 'Incorrect email or password.' },
        { status: 401 },
      );
    }
    const token = await createAdminToken(email);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': secureCookie(token),
      },
    });
  } catch {
    return Response.json(
      { error: 'Enter valid credentials.' },
      { status: 400 },
    );
  }
}
