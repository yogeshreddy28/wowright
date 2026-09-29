import { env } from 'cloudflare:workers';
import { durableRateLimit } from '@/lib/rate-limit';
import {
  createSurveyClaimCode,
  ensureCollegeSurveySchema,
  mayReturnExistingClaim,
  normalizeCollegeSurvey,
} from '@/lib/services/college-survey';
import { CommerceError, safeError, sameOrigin } from '@/lib/services/launch-rules';

type ExistingClaim = {
  claim_code: string;
  name: string;
  college: string;
  redeemed: number;
};

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown'
  ).trim();
}

function duplicateResponse(existing: ExistingClaim, input: { name: string; college: string }) {
  if (!mayReturnExistingClaim(existing, input))
    throw new CommerceError(
      'A keychain claim already exists for this mobile number. Contact WOW RIGHT if you need help finding it.',
      409,
    );
  return Response.json({
    claimCode: existing.claim_code,
    duplicate: true,
    redeemed: Boolean(existing.redeemed),
  });
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await ensureCollegeSurveySchema(env.DB);
    const input = normalizeCollegeSurvey(await request.json());
    const ipAllowed = await durableRateLimit(
      env.DB,
      `college-survey:ip:${clientAddress(request)}`,
      12,
      60 * 60 * 1000,
    );
    const phoneAllowed = await durableRateLimit(
      env.DB,
      `college-survey:phone:${input.phone}`,
      4,
      60 * 60 * 1000,
    );
    if (!ipAllowed || !phoneAllowed)
      throw new CommerceError('Please wait before trying the survey again.', 429);

    const existing = await env.DB.prepare(
      'SELECT claim_code,name,college,redeemed FROM survey_responses WHERE phone=? LIMIT 1',
    )
      .bind(input.phone)
      .first<ExistingClaim>();
    if (existing) return duplicateResponse(existing, input);

    const now = new Date().toISOString();
    for (let attempt = 0; attempt < 8; attempt++) {
      const claimCode = createSurveyClaimCode();
      try {
        await env.DB.prepare(
          `INSERT INTO survey_responses(
            id,claim_code,age,college,course,year,interests,top_interest,budget,
            buying_driver,purchase_intent,product_idea,fandom,name,phone,
            marketing_consent,marketing_consent_timestamp,submitted_at,created_at,updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
          .bind(
            crypto.randomUUID(),
            claimCode,
            input.age,
            input.college,
            input.course || null,
            input.year || null,
            JSON.stringify(input.interests),
            input.topInterest,
            input.budget,
            input.buyingDriver,
            input.purchaseIntent,
            input.productIdea || null,
            input.fandom || null,
            input.name,
            input.phone,
            input.marketingConsent ? 1 : 0,
            input.marketingConsent ? now : null,
            now,
            now,
            now,
          )
          .run();
        return Response.json({ claimCode, duplicate: false }, { status: 201 });
      } catch {
        const raced = await env.DB.prepare(
          'SELECT claim_code,name,college,redeemed FROM survey_responses WHERE phone=? LIMIT 1',
        )
          .bind(input.phone)
          .first<ExistingClaim>();
        if (raced) return duplicateResponse(raced, input);
      }
    }
    throw new CommerceError('Could not create a claim code. Please try again.', 503);
  } catch (error) {
    return safeError(error, 'The survey could not be submitted. Please try again.');
  }
}
