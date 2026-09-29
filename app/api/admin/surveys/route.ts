import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { CommerceError, safeError, sameOrigin } from '@/lib/services/launch-rules';

type SurveyRow = {
  id: string;
  claim_code: string;
  age: string;
  college: string;
  course: string | null;
  year: string | null;
  interests: string;
  top_interest: string;
  budget: string;
  buying_driver: string;
  purchase_intent: string;
  product_idea: string | null;
  fandom: string | null;
  name: string;
  phone: string;
  marketing_consent: number;
  marketing_consent_timestamp: string | null;
  submitted_at: string;
  redeemed: number;
  redeemed_at: string | null;
};

async function distribution(column: string) {
  const allowed = new Set([
    'top_interest',
    'budget',
    'buying_driver',
    'purchase_intent',
    'college',
  ]);
  if (!allowed.has(column)) throw new Error('Invalid survey distribution');
  const result = await env.DB.prepare(
    `SELECT ${column} label,COUNT(*) count FROM survey_responses GROUP BY ${column} ORDER BY count DESC,label LIMIT 100`,
  ).all<{ label: string; count: number }>();
  return result.results;
}

export async function GET(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const [summary, rowsResult, topInterest, budgets, buyingDrivers, intents, colleges] =
      await Promise.all([
        env.DB.prepare(`SELECT
          COUNT(*) total,
          SUM(CASE WHEN date(submitted_at)=date('now') THEN 1 ELSE 0 END) today,
          SUM(marketing_consent) marketing_opt_ins,
          SUM(CASE WHEN purchase_intent='Definitely interested' THEN 1 ELSE 0 END) definitely_interested,
          SUM(redeemed) redeemed,
          SUM(CASE WHEN redeemed=0 THEN 1 ELSE 0 END) pending
        FROM survey_responses`).first(),
        env.DB.prepare(
          `SELECT id,claim_code,age,college,course,year,interests,top_interest,budget,
            buying_driver,purchase_intent,product_idea,fandom,name,phone,
            marketing_consent,marketing_consent_timestamp,submitted_at,redeemed,redeemed_at
          FROM survey_responses ORDER BY submitted_at DESC LIMIT 1000`,
        ).all<SurveyRow>(),
        distribution('top_interest'),
        distribution('budget'),
        distribution('buying_driver'),
        distribution('purchase_intent'),
        distribution('college'),
      ]);
    const rows = rowsResult.results.map((row) => ({
      ...row,
      interests: JSON.parse(row.interests || '[]') as string[],
      marketing_consent: Boolean(row.marketing_consent),
      redeemed: Boolean(row.redeemed),
    }));
    const interestCounts = new Map<string, number>();
    for (const row of rows)
      for (const interest of row.interests)
        interestCounts.set(interest, (interestCounts.get(interest) || 0) + 1);
    const total = Number((summary as { total?: number } | null)?.total || 0);
    return Response.json({
      summary: {
        total,
        today: Number((summary as any)?.today || 0),
        marketingOptIns: Number((summary as any)?.marketing_opt_ins || 0),
        definitelyInterested: Number(
          (summary as any)?.definitely_interested || 0,
        ),
        redeemed: Number((summary as any)?.redeemed || 0),
        pending: Number((summary as any)?.pending || 0),
      },
      distributions: {
        interests: [...interestCounts.entries()]
          .map(([label, count]) => ({
            label,
            count,
            percentage: total ? Math.round((count / total) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count),
        topInterest,
        budgets,
        buyingDrivers,
        purchaseIntents: intents,
        colleges,
      },
      ideas: rows
        .filter((row) => row.product_idea || row.fandom)
        .slice(0, 40)
        .map((row) => ({
          id: row.id,
          productIdea: row.product_idea,
          fandom: row.fandom,
        })),
      responses: rows,
    });
  } catch (error) {
    return safeError(error, 'Survey responses could not be loaded.');
  }
}

const redeemSchema = z.object({
  action: z.enum(['lookup', 'redeem']).default('lookup'),
  claimCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^WR-S-[A-Z2-9]{6}$/),
});

export async function POST(request: Request) {
  if (!(await verifyAdmin(request)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    sameOrigin(request);
    const { action, claimCode } = redeemSchema.parse(await request.json());
    const response = await env.DB.prepare(
      'SELECT id,name,college,claim_code,redeemed,redeemed_at FROM survey_responses WHERE claim_code=? LIMIT 1',
    )
      .bind(claimCode)
      .first<{
        id: string;
        name: string;
        college: string;
        claim_code: string;
        redeemed: number;
        redeemed_at: string | null;
      }>();
    if (!response) throw new CommerceError('Claim code not found.', 404);
    if (action === 'lookup')
      return Response.json({
        respondent: response,
        redeemed: Boolean(response.redeemed),
        redeemedAt: response.redeemed_at,
      });
    if (response.redeemed)
      return Response.json(
        {
          error: 'Already redeemed',
          respondent: response,
          redeemedAt: response.redeemed_at,
        },
        { status: 409 },
      );
    const now = new Date().toISOString();
    const updated = await env.DB.prepare(
      'UPDATE survey_responses SET redeemed=1,redeemed_at=?,updated_at=? WHERE id=? AND redeemed=0',
    )
      .bind(now, now, response.id)
      .run();
    if (!updated.meta.changes)
      throw new CommerceError('This keychain was already redeemed.', 409);
    return Response.json({ ok: true, respondent: response, redeemedAt: now });
  } catch (error) {
    return safeError(error, 'The claim could not be updated.');
  }
}
