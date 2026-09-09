const buckets = new Map<string, { count: number; reset: number }>();
import { createHashToken } from './session-tokens';
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.reset < now) {
    if (buckets.size > 2000)
      for (const [oldKey, bucket] of buckets)
        if (bucket.reset < now) buckets.delete(oldKey);
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count++;
  return true;
}

// Shared between Worker instances; stores hashed keys, never raw IPs or secrets.
// Fail closed on database failure for protected authentication/AI requests.
export async function durableRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
) {
  const hashed = await createHashToken(key);
  const row = await db
    .prepare(
      'INSERT INTO abuse_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE MIN(count+1,1000000) END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count',
    )
    .bind(hashed, now + windowMs, now, now)
    .first<{ count: number }>();
  await db
    .prepare(
      'DELETE FROM abuse_limits WHERE key IN (SELECT key FROM abuse_limits WHERE reset_at<? LIMIT 20)',
    )
    .bind(now - 86400000)
    .run();
  return Boolean(row && row.count <= limit);
}
