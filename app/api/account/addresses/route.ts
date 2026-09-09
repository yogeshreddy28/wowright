import { assertBengaluru, sameOrigin, safeError } from '@/lib/services/launch-rules';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { getCustomerFromRequest } from '@/lib/customer-auth';
const schema = z.object({
  labelType: z.enum(['Home', 'Work', 'Friend / Family', 'Custom']),
  customLabel: z.string().trim().max(40).optional(),
  label: z.string().trim().max(40).optional(),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional(),
  locality: z.string().min(2).max(100),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pinCode: z.string().regex(/^[1-9]\d{5}$/),
  landmark: z.string().max(150).optional(),
  isDefault: z.boolean().optional(),
  latitude: z.coerce.number().finite().min(12.8).max(13.15).optional(),
  longitude: z.coerce.number().finite().min(77.4).max(77.8).optional(),
}).superRefine((value, context) => {
  if ((value.latitude == null) !== (value.longitude == null))
    context.addIssue({ code: 'custom', message: 'Choose a complete map location.' });
  if (value.labelType === 'Custom' && !value.customLabel)
    context.addIssue({ code: 'custom', message: 'Enter a name for this address.' });
});

function addressLabel(data: z.infer<typeof schema>) {
  return data.labelType === 'Custom'
    ? data.customLabel!
    : data.labelType;
}
export async function GET(r: Request) {
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await env.DB.prepare(
    'SELECT id,label,line1,line2,locality,city,state,pin_code,landmark,latitude,longitude,is_default FROM customer_addresses WHERE customer_id=? ORDER BY is_default DESC,created_at DESC',
  )
    .bind(c.id)
    .all();
  return Response.json({ addresses: rows.results });
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
  } catch (error) {
    return safeError(error);
  }
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = schema.parse(await r.json()),
      id = crypto.randomUUID(),
      now = new Date().toISOString();
    if (d.latitude != null && d.longitude != null)
      assertBengaluru({ city: d.city, state: d.state, pinCode: d.pinCode, latitude: d.latitude, longitude: d.longitude });
    const statements = [];
    if (d.isDefault)
      statements.push(
        env.DB.prepare(
          'UPDATE customer_addresses SET is_default=0 WHERE customer_id=?',
        ).bind(c.id),
      );
    statements.push(
      env.DB.prepare(
        'INSERT INTO customer_addresses (id,customer_id,label,line1,line2,locality,city,state,pin_code,landmark,latitude,longitude,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).bind(
        id,
        c.id,
        addressLabel(d),
        d.line1,
        d.line2 || null,
        d.locality,
        d.city,
        d.state,
        d.pinCode,
        d.landmark || null,
        d.latitude ?? null,
        d.longitude ?? null,
        Number(d.isDefault || false),
        now,
        now,
      ),
    );
    await env.DB.batch(statements);
    return Response.json({ id });
  } catch {
    return Response.json({ error: 'Check the address.' }, { status: 400 });
  }
}
export async function PATCH(r: Request) {
  try { sameOrigin(r); } catch (error) { return safeError(error); }
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await r.json() as Record<string, unknown>;
    const id = z.string().parse(raw.id);
    const d = schema.parse(raw);
    if (d.latitude != null && d.longitude != null)
      assertBengaluru({ city: d.city, state: d.state, pinCode: d.pinCode, latitude: d.latitude, longitude: d.longitude });
    const owned = await env.DB.prepare('SELECT id FROM customer_addresses WHERE id=? AND customer_id=?').bind(id, c.id).first();
    if (!owned) return Response.json({ error: 'Address not found.' }, { status: 404 });
    if (await env.DB.prepare('SELECT id FROM orders WHERE address_id=? AND customer_id=? LIMIT 1').bind(id, c.id).first())
      return Response.json({ error: 'This address is part of an existing order. Add a new address so the old delivery record stays unchanged.' }, { status: 409 });
    const statements: D1PreparedStatement[] = [];
    if (d.isDefault) statements.push(env.DB.prepare('UPDATE customer_addresses SET is_default=0 WHERE customer_id=?').bind(c.id));
    statements.push(env.DB.prepare('UPDATE customer_addresses SET label=?,line1=?,line2=?,locality=?,city=?,state=?,pin_code=?,landmark=?,latitude=?,longitude=?,is_default=?,updated_at=? WHERE id=? AND customer_id=?').bind(addressLabel(d), d.line1, d.line2 || null, d.locality, d.city, d.state, d.pinCode, d.landmark || null, d.latitude ?? null, d.longitude ?? null, Number(d.isDefault || false), new Date().toISOString(), id, c.id));
    await env.DB.batch(statements);
    return Response.json({ ok: true });
  } catch (error) { return safeError(error, 'Check the address.'); }
}
export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
  } catch (error) {
    return safeError(error);
  }
  const c = await getCustomerFromRequest(r, env.DB);
  if (!c) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(r.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing address' }, { status: 400 });
  if (
    await env.DB.prepare(
      'SELECT id FROM orders WHERE address_id=? AND customer_id=? LIMIT 1',
    )
      .bind(id, c.id)
      .first()
  )
    return Response.json(
      {
        error:
          'This address belongs to an order and is kept with its delivery record.',
      },
      { status: 409 },
    );
  await env.DB.prepare(
    'DELETE FROM customer_addresses WHERE id=? AND customer_id=?',
  )
    .bind(id, c.id)
    .run();
  return Response.json({ ok: true });
}
