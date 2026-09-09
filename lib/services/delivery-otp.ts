import { CommerceError } from './launch-rules';
import { durableRateLimit } from '@/lib/rate-limit';

const encoder = new TextEncoder();
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join(''); }
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function codeFor(secret: string, stopId: string, nonce: string) {
  const signature = await hmac(secret, `${stopId}:${nonce}`);
  const number = ((signature[0] << 24) | (signature[1] << 16) | (signature[2] << 8) | signature[3]) >>> 0;
  return String(number % 1_000_000).padStart(6, '0');
}
async function codeHash(salt: string, code: string) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}:${code}`))); }
function sameHash(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function requireSecret(secret?: string) { if (!secret || secret.length < 24) throw new CommerceError('Delivery verification is not configured. Ask the owner for help.', 503); return secret; }
type OtpRow = { id: string; stop_id: string; order_id: string; person_id: string; nonce: string; salt: string; code_hash: string; attempts: number; generation_number: number; expires_at: string; verified_at: string | null; consumed_at: string | null; invalidated_at: string | null; override_reason: string | null };

export async function activeDeliveryOtp(db: D1Database, stopId: string) {
  return db.prepare('SELECT * FROM delivery_otps WHERE stop_id=? AND invalidated_at IS NULL ORDER BY generated_at DESC LIMIT 1').bind(stopId).first<OtpRow>();
}
export async function generateDeliveryOtp(db: D1Database, personId: string, stopId: string, secretValue?: string, now = new Date()) {
  const secret = requireSecret(secretValue);
  if (!(await durableRateLimit(db, `delivery-otp-generate:${personId}:${stopId}`, 4, 10 * 60_000, now.getTime()))) throw new CommerceError('Please wait before requesting another code.', 429);
  const stop = await db.prepare("SELECT s.id,s.order_id,s.status FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id WHERE s.id=? AND b.person_id=? AND s.status='otp_pending'").bind(stopId, personId).first<{ id: string; order_id: string; status: string }>();
  if (!stop) throw new CommerceError('Complete the handover and payment steps before requesting a code.', 409);
  const previous = await activeDeliveryOtp(db, stopId);
  if (previous && Date.parse(previous.expires_at) > now.getTime() && Date.parse(previous.expires_at) - now.getTime() > 9 * 60_000) throw new CommerceError('A code was just generated. Please wait before resending.', 429);
  const nonce = crypto.randomUUID(), salt = crypto.randomUUID(), code = await codeFor(secret, stopId, nonce);
  const id = crypto.randomUUID(), generatedAt = now.toISOString(), expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  await db.batch([
    db.prepare('UPDATE delivery_otps SET invalidated_at=?,updated_at=? WHERE stop_id=? AND invalidated_at IS NULL').bind(generatedAt, generatedAt, stopId),
    db.prepare('INSERT INTO delivery_otps(id,stop_id,order_id,person_id,nonce,salt,code_hash,generation_number,expires_at,generated_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id, stopId, stop.order_id, personId, nonce, salt, await codeHash(salt, code), Number(previous?.generation_number || 0) + 1, expiresAt, generatedAt, generatedAt),
  ]);
  return { id, expiresAt };
}
export async function revealDeliveryOtp(db: D1Database, orderId: string, customerId: string, secretValue?: string, now = new Date()) {
  const secret = requireSecret(secretValue);
  const row = await db.prepare("SELECT x.* FROM delivery_otps x JOIN orders o ON o.id=x.order_id JOIN delivery_stops s ON s.id=x.stop_id WHERE x.order_id=? AND o.customer_id=? AND s.status='otp_pending' AND x.invalidated_at IS NULL ORDER BY x.generated_at DESC LIMIT 1").bind(orderId, customerId).first<OtpRow>();
  if (!row || row.verified_at || row.consumed_at || Date.parse(row.expires_at) <= now.getTime()) return null;
  return { code: await codeFor(secret, row.stop_id, row.nonce), expiresAt: row.expires_at };
}
export async function verifyDeliveryOtp(db: D1Database, personId: string, stopId: string, input: string, now = new Date()) {
  if (!(await durableRateLimit(db, `delivery-otp-verify:${personId}:${stopId}`, 8, 10 * 60_000, now.getTime()))) throw new CommerceError('Too many attempts. Wait before trying again.', 429);
  if (!/^\d{6}$/.test(input)) throw new CommerceError('Enter the 6-digit code.');
  const row = await db.prepare("SELECT x.* FROM delivery_otps x JOIN delivery_batches b ON b.person_id=x.person_id JOIN delivery_stops s ON s.id=x.stop_id AND s.batch_id=b.id WHERE x.stop_id=? AND x.person_id=? AND x.invalidated_at IS NULL ORDER BY x.generated_at DESC LIMIT 1").bind(stopId, personId).first<OtpRow>();
  if (!row) throw new CommerceError('No active code was found.', 404);
  if (row.consumed_at || row.verified_at) throw new CommerceError('This code has already been used.', 409);
  if (Date.parse(row.expires_at) <= now.getTime()) throw new CommerceError('This code has expired. Request a new one.', 410);
  if (row.attempts >= 5) throw new CommerceError('Too many incorrect attempts. Request a new code.', 429);
  const matches = sameHash(await codeHash(row.salt, input), row.code_hash);
  if (!matches) {
    await db.prepare('UPDATE delivery_otps SET attempts=attempts+1,updated_at=? WHERE id=?').bind(now.toISOString(), row.id).run();
    throw new CommerceError(row.attempts + 1 >= 5 ? 'Too many incorrect attempts. Request a new code.' : 'That code is incorrect.', row.attempts + 1 >= 5 ? 429 : 400);
  }
  await db.prepare('UPDATE delivery_otps SET verified_at=?,updated_at=? WHERE id=? AND verified_at IS NULL AND consumed_at IS NULL').bind(now.toISOString(), now.toISOString(), row.id).run();
  return { verified: true };
}
export async function overrideDeliveryOtp(db: D1Database, stopId: string, reason: string, actor = 'admin', now = new Date()) {
  if (reason.trim().length < 10) throw new CommerceError('Explain why the customer OTP cannot be used.');
  const stop = await db.prepare("SELECT s.id,s.order_id,b.person_id FROM delivery_stops s JOIN delivery_batches b ON b.id=s.batch_id WHERE s.id=? AND s.status='otp_pending'").bind(stopId).first<{ id: string; order_id: string; person_id: string }>();
  if (!stop) throw new CommerceError('OTP-pending delivery not found.', 404);
  const time = now.toISOString(), active = await activeDeliveryOtp(db, stopId), id = active?.id || crypto.randomUUID();
  if (active) await db.prepare('UPDATE delivery_otps SET verified_at=?,override_reason=?,override_actor=?,updated_at=? WHERE id=? AND consumed_at IS NULL').bind(time, reason.trim(), actor, time, id).run();
  else await db.prepare('INSERT INTO delivery_otps(id,stop_id,order_id,person_id,nonce,salt,code_hash,expires_at,verified_at,override_reason,override_actor,generated_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, stopId, stop.order_id, stop.person_id, 'override', 'override', 'override', time, time, reason.trim(), actor, time, time).run();
  await db.prepare('INSERT INTO admin_audit_events(id,action,metadata,created_at) VALUES(?,?,?,?)').bind(crypto.randomUUID(), 'delivery_otp_overridden', JSON.stringify({ stopId, orderId: stop.order_id, reason: reason.trim() }), time).run();
  return { verified: true, override: true };
}
