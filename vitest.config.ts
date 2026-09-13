import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Password hashing is intentionally expensive and several auth suites run
    // concurrently on CI. Keep the timeout above the secure-hash work factor.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
