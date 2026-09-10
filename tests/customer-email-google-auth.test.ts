import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';

const state = vi.hoisted(() => ({
  DB: {} as D1Database,
  SITE_URL: 'http://local',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
}));
vi.mock('cloudflare:workers', () => ({ env: state }));
import { POST as register } from '@/app/api/account/register/route';
import { POST as login } from '@/app/api/account/login/route';
import { POST as verifyEmail } from '@/app/api/account/verify-email/route';
import { POST as resetPassword } from '@/app/api/account/reset-password/route';
import { POST as forgotPassword } from '@/app/api/account/forgot-password/route';
import { GET as googleCallback } from '@/app/api/account/google/callback/route';
import { POST as googleComplete } from '@/app/api/account/google/complete/route';
import { createCustomerAuthToken } from '@/lib/customer-auth';
import { sendVerificationEmail } from '@/lib/services/customer-email';
import { createGoogleAuthorization } from '@/lib/services/google-auth';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
  state.RESEND_API_KEY = '';
  state.EMAIL_FROM = '';
});
afterEach(() => { vi.unstubAllGlobals(); database.sqlite.close(); });
function post(path: string, body: unknown, cookie = '') {
  return new Request(`http://local${path}`, { method: 'POST', headers: { origin: 'http://local', 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
}

describe('customer email authentication', () => {
  it('sends branded transactional email only through server-side provider configuration', async () => {
    state.RESEND_API_KEY = 'test-resend-secret';
    state.EMAIL_FROM = 'WOW RIGHT <account@example.com>';
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBe('Bearer test-resend-secret');
      const body = JSON.parse(String(init?.body)) as { from: string; to: string; html: string };
      expect(body).toMatchObject({ from: 'WOW RIGHT <account@example.com>', to: 'person@example.com' });
      expect(body.html).toContain('WOW');
      expect(body.html).toContain('RIGHT');
      return Response.json({ id: 'email-test' });
    });

    vi.stubGlobal('fetch', fetcher);
    await expect(sendVerificationEmail('person@example.com', 'verification-token')).resolves.toEqual({ sent: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('requires a valid email and permits login before and after verification', async () => {
    expect((await register(post('/api/account/register', { name: 'Person', phone: '9000000031', password: 'long-password' }))).status).toBe(400);
    expect((await register(post('/api/account/register', { name: 'Person', phone: '9000000031', email: 'bad', password: 'long-password' }))).status).toBe(400);
    const password = 'long-password-123';
    expect((await register(post('/api/account/register', { name: 'Person', phone: '9000000031', email: 'Person@Example.com', password }))).status).toBe(200);
    const before = await login(post('/api/account/login', { email: 'person@example.com', password }));
    expect(before.status).toBe(200);
    expect(((await before.json()) as { emailVerified: boolean }).emailVerified).toBe(false);
    const customer = database.sqlite.prepare('SELECT id,email_normalized FROM customers').get() as { id: string; email_normalized: string };
    expect(customer.email_normalized).toBe('person@example.com');
    const token = await createCustomerAuthToken(database.db, customer.id, 'verify_email', 60_000);
    expect((await verifyEmail(post('/api/account/verify-email', { token }))).status).toBe(200);
    expect(((await (await login(post('/api/account/login', { email: 'person@example.com', password }))).json()) as { emailVerified: boolean }).emailVerified).toBe(true);
    expect((await verifyEmail(post('/api/account/verify-email', { token }))).status).toBe(400);
  });

  it('uses expiring single-use reset tokens and invalidates existing sessions', async () => {
    const password = 'original-password';
    await register(post('/api/account/register', { name: 'Reset Person', phone: '9000000032', email: 'reset@example.com', password }));
    const customer = database.sqlite.prepare("SELECT id FROM customers WHERE email_normalized='reset@example.com'").get() as { id: string };
    const expired = await createCustomerAuthToken(database.db, customer.id, 'reset_password', 60_000);
    database.sqlite.prepare("UPDATE customer_auth_tokens SET expires_at='2000-01-01' WHERE purpose='reset_password'").run();
    expect((await resetPassword(post('/api/account/reset-password', { token: expired, password: 'new-password-123' }))).status).toBe(400);
    const valid = await createCustomerAuthToken(database.db, customer.id, 'reset_password', 60_000);
    expect((await resetPassword(post('/api/account/reset-password', { token: valid, password: 'new-password-123' }))).status).toBe(200);
    expect((await resetPassword(post('/api/account/reset-password', { token: valid, password: 'another-password' }))).status).toBe(400);
    expect((await login(post('/api/account/login', { email: 'reset@example.com', password }))).status).toBe(401);
    expect((await login(post('/api/account/login', { email: 'reset@example.com', password: 'new-password-123' }))).status).toBe(200);
  });

  it('does not reveal whether a forgot-password email exists', async () => {
    await register(post('/api/account/register', { name: 'Known', phone: '9000000033', email: 'known@example.com', password: 'known-password' }));
    const known = await forgotPassword(post('/api/account/forgot-password', { email: 'known@example.com' }));
    const unknown = await forgotPassword(post('/api/account/forgot-password', { email: 'unknown@example.com' }));
    expect(known.status).toBe(200); expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });
});

describe('Google OIDC account flow', () => {
  function mockGoogle(email: string, sub: string, name = 'Google Person') {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/tokeninfo')) return Response.json({ aud: 'google-client', iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 300), sub, email, email_verified: 'true', name, nonce: database.sqlite.prepare('SELECT nonce FROM google_oauth_states ORDER BY created_at DESC LIMIT 1').get()!.nonce });
      return Response.json({ id_token: 'mock-id-token' });
    }));
  }
  it('creates a password-free Google customer and stores the verified email', async () => {
    mockGoogle('google@example.com', 'google-subject');
    const auth = await createGoogleAuthorization(database.db, '/checkout');
    const callback = await googleCallback(new Request(`http://local/api/account/google/callback?state=${auth.state}&code=code`, { headers: { cookie: `wow_google_oauth=${auth.state}` } }));
    expect(callback.status).toBe(302);
    const completed = await googleComplete(post('/api/account/google/complete', { name: 'Google Person', phone: '9000000034' }, `wow_google_oauth=${auth.state}`));
    expect(completed.status).toBe(200);
    const row = database.sqlite.prepare("SELECT email,email_verified_at,auth_method,google_subject,password_hash FROM customers WHERE email_normalized='google@example.com'").get() as Record<string, unknown>;
    expect(row).toMatchObject({ email: 'google@example.com', auth_method: 'google', google_subject: 'google-subject', password_hash: null });
    expect(row.email_verified_at).toBeTruthy();
  });

  it('logs a returning Google customer in without creating a duplicate', async () => {
    database.sqlite.exec("INSERT INTO customers(id,name,mobile,email,email_normalized,email_verified_at,auth_method) VALUES('returning','Returning','919000000035','returning@example.com','returning@example.com','2026-01-01','email')");
    mockGoogle('returning@example.com', 'returning-google');
    const auth = await createGoogleAuthorization(database.db, '/account');
    const response = await googleCallback(new Request(`http://local/api/account/google/callback?state=${auth.state}&code=code`, { headers: { cookie: `wow_google_oauth=${auth.state}` } }));
    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('wow_customer_session=');
    expect(database.sqlite.prepare('SELECT count(*) n FROM customers').get()!.n).toBe(1);
    expect(database.sqlite.prepare("SELECT google_subject FROM customers WHERE id='returning'").get()!.google_subject).toBe('returning-google');
  });
});
