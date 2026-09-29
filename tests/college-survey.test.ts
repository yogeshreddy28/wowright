import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testDatabase } from './helpers/d1';
import {
  collegeSurveySchema,
  createSurveyClaimCode,
  normalizeCollegeSurvey,
} from '@/lib/services/college-survey';

const state = vi.hoisted(() => ({
  DB: {} as D1Database,
  adminAllowed: false,
}));
vi.mock('cloudflare:workers', () => ({ env: state }));
vi.mock('@/lib/admin-auth', () => ({
  verifyAdmin: async () => state.adminAllowed,
}));

import { POST as submitSurvey } from '@/app/api/survey/route';
import {
  GET as getSurveys,
  POST as redeemSurvey,
} from '@/app/api/admin/surveys/route';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  state.DB = database.db;
  state.adminAllowed = false;
});
afterEach(() => database.sqlite.close());

const valid = {
  age: '18–20',
  college: 'Test College',
  course: 'Design',
  year: '2nd year',
  interests: ['Anime & Gaming', 'Keychains'],
  topInterest: 'Anime & Gaming',
  budget: '₹300–499',
  buyingDriver: "It's unique / hard to find",
  purchaseIntent: 'Definitely interested',
  productIdea: 'A useful desk figure',
  fandom: 'Games',
  name: 'Test Student',
  phone: '9000000001',
  marketingConsent: true,
};

function post(path: string, body: unknown) {
  return new Request(`http://local${path}`, {
    method: 'POST',
    headers: {
      origin: 'http://local',
      'content-type': 'application/json',
      'cf-connecting-ip': `192.0.2.${Math.floor(Math.random() * 200) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

describe('college product survey', () => {
  it('validates required answers and Indian mobiles', () => {
    expect(collegeSurveySchema.safeParse({}).success).toBe(false);
    expect(() => normalizeCollegeSurvey({ ...valid, phone: '12345' })).toThrow(
      'valid 10-digit Indian mobile',
    );
    expect(normalizeCollegeSurvey(valid).phone).toBe('919000000001');
  });

  it('creates server-formatted claim codes', () => {
    expect(createSurveyClaimCode(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe(
      'WR-S-ABCDEF',
    );
  });

  it('saves consent choices and gives marketing NO the same free claim', async () => {
    const yes = await submitSurvey(post('/api/survey', valid));
    expect(yes.status).toBe(201);
    const yesResult = (await yes.json()) as { claimCode: string };
    expect(yesResult.claimCode).toMatch(/^WR-S-[A-Z2-9]{6}$/);
    const no = await submitSurvey(
      post('/api/survey', {
        ...valid,
        name: 'Second Student',
        phone: '9000000002',
        marketingConsent: false,
      }),
    );
    expect(no.status).toBe(201);
    expect((await no.json()) as { claimCode: string }).toHaveProperty(
      'claimCode',
    );
    expect(
      database.sqlite
        .prepare(
          'SELECT marketing_consent,marketing_consent_timestamp FROM survey_responses ORDER BY phone',
        )
        .all(),
    ).toEqual([
      { marketing_consent: 1, marketing_consent_timestamp: expect.any(String) },
      { marketing_consent: 0, marketing_consent_timestamp: null },
    ]);
  });

  it('returns the same claim only to a matching repeat submission', async () => {
    const first = await submitSurvey(post('/api/survey', valid));
    const firstCode = ((await first.json()) as { claimCode: string }).claimCode;
    const repeat = await submitSurvey(post('/api/survey', valid));
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toMatchObject({
      claimCode: firstCode,
      duplicate: true,
    });
    const mismatch = await submitSurvey(
      post('/api/survey', { ...valid, name: 'Someone Else' }),
    );
    expect(mismatch.status).toBe(409);
    expect(
      database.sqlite.prepare('SELECT COUNT(*) count FROM survey_responses').get(),
    ).toEqual({ count: 1 });
  });

  it('protects Admin data and supports analytics plus one-time redemption', async () => {
    await submitSurvey(post('/api/survey', valid));
    expect(
      (await getSurveys(new Request('http://local/api/admin/surveys'))).status,
    ).toBe(401);
    state.adminAllowed = true;
    const loaded = await getSurveys(
      new Request('http://local/api/admin/surveys'),
    );
    expect(loaded.status).toBe(200);
    const data = (await loaded.json()) as any;
    expect(data.summary).toMatchObject({
      total: 1,
      marketingOptIns: 1,
      definitelyInterested: 1,
      pending: 1,
    });
    expect(data.distributions.interests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Anime & Gaming', percentage: 100 }),
      ]),
    );
    const claimCode = data.responses[0].claim_code;
    const lookup = await redeemSurvey(
      post('/api/admin/surveys', { claimCode, action: 'lookup' }),
    );
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject({
      redeemed: false,
      respondent: { name: 'Test Student' },
    });
    const redeemed = await redeemSurvey(
      post('/api/admin/surveys', { claimCode, action: 'redeem' }),
    );
    expect(redeemed.status).toBe(200);
    const second = await redeemSurvey(
      post('/api/admin/surveys', { claimCode, action: 'redeem' }),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: 'Already redeemed' });
  });
});
