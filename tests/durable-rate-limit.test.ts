import { it, expect } from 'vitest';
import { testDatabase } from './helpers/d1';
import { durableRateLimit } from '@/lib/rate-limit';
it('shares limits across requests, hashes identifiers and reopens expired windows', async () => {
  const { db, sqlite } = testDatabase();
  try {
    expect(
      await durableRateLimit(db, 'test-ip:private-identifier', 2, 1000, 10000),
    ).toBe(true);
    expect(
      await durableRateLimit(db, 'test-ip:private-identifier', 2, 1000, 10001),
    ).toBe(true);
    expect(
      await durableRateLimit(db, 'test-ip:private-identifier', 2, 1000, 10002),
    ).toBe(false);
    expect(
      JSON.stringify(sqlite.prepare('SELECT * FROM abuse_limits').all()),
    ).not.toContain('private-identifier');
    expect(
      await durableRateLimit(db, 'test-ip:private-identifier', 2, 1000, 11000),
    ).toBe(true);
  } finally {
    sqlite.close();
  }
});
