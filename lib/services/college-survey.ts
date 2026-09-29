import { z } from 'zod';
import { normalizeIndianPhone } from './phone';

export const surveyInterests = [
  'Anime & Gaming',
  'Cute & Collectibles',
  'Desk Accessories',
  'Room Décor',
  'Keychains',
  'Fidgets & Moving Toys',
  'Personalized Products',
  'Phone & Tech Accessories',
  'Jewellery & Accessories',
  'Gifts for Friends / Couples',
  'Spiritual & Devotional',
  'Useful Everyday Products',
] as const;

export const surveyAges = ['Under 18', '18–20', '21–23', '24+'] as const;
export const surveyBudgets = [
  'Under ₹100',
  '₹100–199',
  '₹200–299',
  '₹300–499',
  '₹500–799',
  '₹800+',
] as const;
export const surveyBuyingDrivers = [
  'It looks amazing',
  "It's actually useful",
  "It's personalized for me",
  "It's unique / hard to find",
  'It makes a great gift',
  "It's affordable",
  "It's trending / fandom related",
] as const;
export const surveyPurchaseIntents = [
  'Definitely interested',
  'Maybe — depends on design and price',
  'Mostly browsing',
] as const;

const shortText = (maximum: number) =>
  z.string().trim().max(maximum).optional().default('');

export const collegeSurveySchema = z.object({
  age: z.enum(surveyAges),
  college: z.string().trim().min(2).max(140),
  course: shortText(100),
  year: shortText(40),
  interests: z.array(z.enum(surveyInterests)).min(1).max(surveyInterests.length),
  topInterest: z.enum(surveyInterests),
  budget: z.enum(surveyBudgets),
  buyingDriver: z.enum(surveyBuyingDrivers),
  purchaseIntent: z.enum(surveyPurchaseIntents),
  productIdea: shortText(500),
  fandom: shortText(240),
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(1).max(20),
  marketingConsent: z.boolean(),
});

export type CollegeSurveyInput = z.infer<typeof collegeSurveySchema>;

export function normalizeCollegeSurvey(input: unknown) {
  const parsed = collegeSurveySchema.parse(input);
  return {
    ...parsed,
    phone: normalizeIndianPhone(parsed.phone),
    interests: [...new Set(parsed.interests)],
  };
}

const claimAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function createSurveyClaimCode(random = crypto.getRandomValues(new Uint8Array(6))) {
  let suffix = '';
  for (const value of random) suffix += claimAlphabet[value % claimAlphabet.length];
  return `WR-S-${suffix}`;
}

export function mayReturnExistingClaim(
  existing: { name: string; college: string },
  submitted: { name: string; college: string },
) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase('en-IN');
  return (
    normalize(existing.name) === normalize(submitted.name) &&
    normalize(existing.college) === normalize(submitted.college)
  );
}
