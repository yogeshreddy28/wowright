import { pbkdf2, scrypt } from 'node:crypto';

const encoder = new TextEncoder();
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
export async function sha256(value: string) {
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
  // Workers Web Crypto rejects PBKDF2 above 100,000 iterations. The
  // node:crypto compatibility implementation supports the existing stronger
  // work factor, so production can create and verify the same hashes as local.
  return new Promise<Uint8Array>((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Uint8Array.from(derivedKey));
    });
  });
}
async function deriveScrypt(password: string, salt: Uint8Array) {
  return new Promise<Uint8Array>((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(Uint8Array.from(derivedKey));
      },
    );
  });
}
export async function hashCustomerPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveScrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}
export async function verifyCustomerPassword(password: string, stored: string) {
  const parts = stored.split('$');
  let actual: Uint8Array;
  let expectedValue: string | undefined;
  if (parts[0] === 'scrypt') {
    const [, n, r, p, saltValue, encodedExpected] = parts;
    if (
      Number(n) !== SCRYPT_N ||
      Number(r) !== SCRYPT_R ||
      Number(p) !== SCRYPT_P ||
      !saltValue ||
      !encodedExpected
    )
      return false;
    actual = await deriveScrypt(password, base64ToBytes(saltValue));
    expectedValue = encodedExpected;
  } else {
    const [algorithm, count, saltValue, encodedExpected] = parts;
    if (
      algorithm !== 'pbkdf2_sha256' ||
      !count ||
      !saltValue ||
      !encodedExpected
    )
      return false;
    actual = await derivePassword(
      password,
      base64ToBytes(saltValue),
      Number(count),
    );
    expectedValue = encodedExpected;
  }
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
      `SELECT c.id,c.name,c.mobile,c.email,c.email_verified_at,c.auth_method FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_at>?`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{
      id: string;
      name: string;
      mobile: string;
      email: string | null;
      email_verified_at: string | null;
      auth_method: string;
    }>();
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function createCustomerAuthToken(
  db: D1Database,
  customerId: string,
  purpose: 'verify_email' | 'reset_password',
  lifetimeMs: number,
) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
  const now = new Date();
  await db.batch([
    db.prepare(
      'UPDATE customer_auth_tokens SET used_at=? WHERE customer_id=? AND purpose=? AND used_at IS NULL',
    ).bind(now.toISOString(), customerId, purpose),
    db.prepare(
      'INSERT INTO customer_auth_tokens (id,customer_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)',
    ).bind(
      crypto.randomUUID(),
      customerId,
      purpose,
      await sha256(token),
      new Date(now.getTime() + lifetimeMs).toISOString(),
      now.toISOString(),
    ),
  ]);
  return token;
}

export async function consumeCustomerAuthToken(
  db: D1Database,
  token: string,
  purpose: 'verify_email' | 'reset_password',
) {
  const now = new Date().toISOString();
  const row = await db.prepare(
    'SELECT id,customer_id FROM customer_auth_tokens WHERE token_hash=? AND purpose=? AND used_at IS NULL AND expires_at>?',
  ).bind(await sha256(token), purpose, now).first<{ id: string; customer_id: string }>();
  if (!row) return null;
  const result = await db.prepare(
    'UPDATE customer_auth_tokens SET used_at=? WHERE id=? AND used_at IS NULL',
  ).bind(now, row.id).run();
  return result.meta.changes === 1 ? row.customer_id : null;
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
