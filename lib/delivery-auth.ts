import { createHashToken, makeSessionToken } from './session-tokens';
export async function deliveryPerson(request: Request, db: D1Database) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('wow_delivery_session='))
    ?.slice(21);
  if (!token) return null;
  return db
    .prepare(
      'SELECT p.id,p.name,p.mobile FROM delivery_sessions s JOIN delivery_people p ON p.id=s.person_id WHERE s.token_hash=? AND s.expires_at>? AND p.active=1',
    )
    .bind(await createHashToken(token), new Date().toISOString())
    .first<{ id: string; name: string; mobile: string }>();
}
export async function deliveryCookie(db: D1Database, id: string) {
  const token = makeSessionToken();
  await db
    .prepare(
      'INSERT INTO delivery_sessions (id,person_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      id,
      await createHashToken(token),
      new Date(Date.now() + 12 * 3600000).toISOString(),
      new Date().toISOString(),
    )
    .run();
  return `wow_delivery_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function revokeDeliverySession(request: Request, db: D1Database) {
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('wow_delivery_session='))
    ?.slice(21);
  if (token)
    await db
      .prepare('DELETE FROM delivery_sessions WHERE token_hash=?')
      .bind(await createHashToken(token))
      .run();
}
