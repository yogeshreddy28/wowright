import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
import { durableRateLimit } from '@/lib/rate-limit';

const querySchema = z.object({
  latitude: z.coerce.number().min(12.8).max(13.15),
  longitude: z.coerce.number().min(77.4).max(77.8),
});

export async function GET(request: Request) {
  const customer = await getCustomerFromRequest(request, env.DB);
  if (!customer) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await durableRateLimit(env.DB, `reverse:${customer.id}`, 12, 60_000)))
    return Response.json({ error: 'Please wait before checking another location.' }, { status: 429 });
  try {
    const url = new URL(request.url);
    const point = querySchema.parse(Object.fromEntries(url.searchParams));
    const upstream = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.latitude}&lon=${point.longitude}&addressdetails=1`, {
      headers: { 'User-Agent': 'WOW-RIGHT/1.0 (customer delivery address)' },
    });
    if (!upstream.ok) throw new Error('provider');
    const result = await upstream.json() as { address?: Record<string, string> };
    const a = result.address || {};
    return Response.json({
      address: {
        line1: [a.house_number, a.road || a.pedestrian].filter(Boolean).join(' '),
        locality: a.suburb || a.neighbourhood || a.quarter || '',
        city: a.city || a.town || a.municipality || 'Bengaluru',
        state: a.state || 'Karnataka',
        pinCode: a.postcode || '',
      },
    });
  } catch {
    return Response.json({ error: 'We found your pin, but could not read the nearby address. Enter it below.' }, { status: 502 });
  }
}
