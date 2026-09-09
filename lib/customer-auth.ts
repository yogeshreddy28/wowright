const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const stableSalt = Uint8Array.from(salt);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: stableSalt, iterations },
      key,
      256,
    ),
  );
}
export async function hashCustomerPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}
export async function verifyCustomerPassword(password: string, stored: string) {
  const [algorithm, count, saltValue, expectedValue] = stored.split('$');
  if (algorithm !== 'pbkdf2_sha256' || !count || !saltValue || !expectedValue)
    return false;
  const actual = await derivePassword(
    password,
    base64ToBytes(saltValue),
    Number(count),
  );
  const expected = base64ToBytes(expectedValue);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual[i]! ^ expected[i]!;
  return difference === 0;
}
function cookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export async function createCustomerSession(
  db: D1Database,
  customerId: string,
) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    '-',
    '',
  );
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare(
      'INSERT INTO customer_sessions (id,customer_id,token_hash,expires_at,created_at,last_used_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      customerId,
      tokenHash,
      expires,
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  return `wow_customer_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function getCustomerFromRequest(request: Request, db: D1Database) {
  const token = cookie(request, 'wow_customer_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  return db
    .prepare(
      `SELECT c.id,c.name,c.mobile,c.email FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{
      id: string;
      name: string;
      mobile: string;
      email: string | null;
    }>();
}
export async function createOrderAccess(db: D1Database, orderId: string) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll(
    '-',
    '',
  );
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db
    .prepare(
      'INSERT INTO order_access_tokens (id,order_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      orderId,
      tokenHash,
      expires,
      new Date().toISOString(),
    )
    .run();
  return `wow_order_access=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function canAccessOrder(
  request: Request,
  db: D1Database,
  orderId: string,
  customerId: string,
) {
  const customer = await getCustomerFromRequest(request, db);
  if (customer?.id === customerId) return true;
  const token = cookie(request, 'wow_order_access');
  if (!token) return false;
  const tokenHash = await sha256(token);
  return Boolean(
    await db
      .prepare(
        'SELECT id FROM order_access_tokens WHERE token_hash=? AND order_id=? AND expires_at>?',
      )
      .bind(tokenHash, orderId, new Date().toISOString())
      .first(),
  );
}
export const clearCustomerSessionCookie = `wow_customer_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

export async function revokeCustomerSession(request: Request, db: D1Database) {
  const token = cookie(request, 'wow_customer_session');
  if (token)
    await db
      .prepare('DELETE FROM customer_sessions WHERE token_hash=?')
      .bind(await sha256(token))
      .run();
}
