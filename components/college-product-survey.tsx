'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, Copy, Gift, Share2 } from 'lucide-react';
import {
  surveyAges,
  surveyBudgets,
  surveyBuyingDrivers,
  surveyInterests,
  surveyPurchaseIntents,
} from '@/lib/services/college-survey';

type FormState = {
  age: string;
  college: string;
  course: string;
  year: string;
  interests: string[];
  topInterest: string;
  budget: string;
  buyingDriver: string;
  purchaseIntent: string;
  productIdea: string;
  fandom: string;
  name: string;
  phone: string;
  marketingConsent: boolean | null;
};

const initialForm: FormState = {
  age: '',
  college: '',
  course: '',
  year: '',
  interests: [],
  topInterest: '',
  budget: '',
  buyingDriver: '',
  purchaseIntent: '',
  productIdea: '',
  fandom: '',
  name: '',
  phone: '',
  marketingConsent: null,
};

function ChoiceGrid({
  values,
  selected,
  multiple = false,
  onChange,
}: {
  values: readonly string[];
  selected: string | string[];
  multiple?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="survey-choices" role={multiple ? 'group' : 'radiogroup'}>
      {values.map((value) => {
        const active = Array.isArray(selected)
          ? selected.includes(value)
          : selected === value;
        return (
          <button
            key={value}
            type="button"
            className={active ? 'selected' : ''}
            aria-pressed={multiple ? active : undefined}
            role={multiple ? undefined : 'radio'}
            aria-checked={multiple ? undefined : active}
            onClick={() => onChange(value)}
          >
            <span>{value}</span>
            {active && <Check aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

export function CollegeProductSurvey() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claim, setClaim] = useState<{ code: string; duplicate: boolean } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const progress = useMemo(() => Math.round((step / 9) * 100), [step]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  }
  function toggleInterest(value: string) {
    update(
      'interests',
      form.interests.includes(value)
        ? form.interests.filter((item) => item !== value)
        : [...form.interests, value],
    );
  }
  function validateCurrentStep() {
    if (step === 1 && !form.age) return 'Choose your age range.';
    if (step === 2 && form.college.trim().length < 2)
      return 'Enter your college name.';
    if (step === 3 && !form.interests.length)
      return 'Choose at least one product interest.';
    if (step === 4 && !form.topInterest)
      return 'Choose the one category you are most likely to buy.';
    if (step === 5 && !form.budget) return 'Choose your comfortable budget.';
    if (step === 6 && !form.buyingDriver)
      return 'Choose what matters most when you buy.';
    if (step === 7 && !form.purchaseIntent)
      return 'Choose the answer closest to how you feel.';
    if (step === 9) {
      if (form.name.trim().length < 2) return 'Enter your name.';
      const phoneDigits = form.phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(phoneDigits))
        return 'Enter a valid 10-digit Indian mobile number.';
      if (form.marketingConsent === null)
        return 'Choose whether you want student offers on WhatsApp.';
    }
    return '';
  }
  function next() {
    const message = validateCurrentStep();
    if (message) return setError(message);
    setStep((current) => Math.min(9, current + 1));
  }
  async function submit() {
    const message = validateCurrentStep();
    if (message) return setError(message);
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = (await response.json()) as {
        claimCode?: string;
        duplicate?: boolean;
        error?: string;
      };
      if (!response.ok || !result.claimCode)
        throw new Error(result.error || 'Could not submit the survey.');
      setClaim({ code: result.claimCode, duplicate: Boolean(result.duplicate) });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Could not submit the survey. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function copyClaim() {
    if (!claim) return;
    await navigator.clipboard.writeText(claim.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  async function shareClaim() {
    if (!claim) return;
    const text = `My WOW RIGHT free keychain claim code is ${claim.code}.`;
    if (navigator.share) await navigator.share({ title: 'WOW RIGHT claim', text });
    else await navigator.clipboard.writeText(text);
  }

  if (claim)
    return (
      <main className="survey-page survey-success">
        <section className="survey-card">
          <div className="survey-brand"><span>WOW</span> RIGHT</div>
          <div className="survey-success-icon"><Gift /></div>
          <p className="eyebrow">Survey complete</p>
          <h1>You&apos;re done! 🎉</h1>
          <p>Thanks for helping WOW RIGHT understand what students actually want.</p>
          {claim.duplicate && (
            <p className="survey-note">You already completed the survey, so we recovered your original claim code.</p>
          )}
          <div className="survey-claim">
            <span>Free keychain claim code</span>
            <strong>{claim.code}</strong>
          </div>
          <p>Take a screenshot of this page or save your claim code.</p>
          <div className="survey-success-actions">
            <button className="button primary" type="button" onClick={copyClaim}>
              <Copy /> {copied ? 'Copied' : 'Copy claim code'}
            </button>
            <button className="button secondary" type="button" onClick={shareClaim}>
              <Share2 /> Share
            </button>
          </div>
          <Link href="/shop">Explore WOW RIGHT products</Link>
        </section>
      </main>
    );

  return (
    <main className="survey-page">
      <section className="survey-card">
        <header className="survey-header">
          <Link className="survey-brand" href="/"><span>WOW</span> RIGHT</Link>
          {step > 0 && <small>{step} of 9</small>}
        </header>
        {step > 0 && (
          <div className="survey-progress" aria-label={`${progress}% complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}

        {step === 0 && (
          <div className="survey-intro">
            <div className="survey-gift"><Gift /></div>
            <p className="eyebrow">College product survey</p>
            <h1>Help us build products you&apos;d actually want.</h1>
            <p>
              We&apos;re WOW RIGHT, a 3D-printing brand. We&apos;re researching what college students actually want us to create next.
            </p>
            <div className="survey-reward">🎁 Complete the survey → Get a free 3D-printed keychain</div>
            <small>Honest answers help us make better products. Takes about 60–90 seconds.</small>
          </div>
        )}
        {step === 1 && <SurveyQuestion eyebrow="A little about you" title="What is your age?" required><ChoiceGrid values={surveyAges} selected={form.age} onChange={(value) => update('age', value)} /></SurveyQuestion>}
        {step === 2 && <SurveyQuestion eyebrow="Your college" title="Where do you study?" required><div className="survey-fields"><label>College name<input value={form.college} onChange={(event) => update('college', event.target.value)} maxLength={140} required /></label><label>Course / department <small>optional</small><input value={form.course} onChange={(event) => update('course', event.target.value)} maxLength={100} /></label><label>Year <small>optional</small><input value={form.year} onChange={(event) => update('year', event.target.value)} maxLength={40} placeholder="e.g. 2nd year" /></label></div></SurveyQuestion>}
        {step === 3 && <SurveyQuestion eyebrow="Choose all that fit" title="What kinds of products interest you?" required><ChoiceGrid values={surveyInterests} selected={form.interests} multiple onChange={toggleInterest} /></SurveyQuestion>}
        {step === 4 && <SurveyQuestion eyebrow="Your top choice" title="If you could choose only ONE, which category are you most likely to spend your own money on?" required><ChoiceGrid values={surveyInterests} selected={form.topInterest} onChange={(value) => update('topInterest', value)} /></SurveyQuestion>}
        {step === 5 && <SurveyQuestion eyebrow="Comfortable budget" title="If you found a product you genuinely loved, how much would you comfortably spend?" required><ChoiceGrid values={surveyBudgets} selected={form.budget} onChange={(value) => update('budget', value)} /></SurveyQuestion>}
        {step === 6 && <SurveyQuestion eyebrow="One deciding factor" title="What matters MOST when deciding to buy?" required><ChoiceGrid values={surveyBuyingDrivers} selected={form.buyingDriver} onChange={(value) => update('buyingDriver', value)} /></SurveyQuestion>}
        {step === 7 && <SurveyQuestion eyebrow="Purchase intent" title="If WOW RIGHT made your ideal product at a price you're comfortable with, how likely are you to buy it?" required><ChoiceGrid values={surveyPurchaseIntents} selected={form.purchaseIntent} onChange={(value) => update('purchaseIntent', value)} /></SurveyQuestion>}
        {step === 8 && <SurveyQuestion eyebrow="Help us discover ideas" title="What should we make next?"><div className="survey-fields"><label>What product would you love to buy but don&apos;t easily find? <small>optional</small><textarea value={form.productIdea} onChange={(event) => update('productIdea', event.target.value)} maxLength={500} rows={4} /></label><label>Favourite anime / game / hobby / fandom <small>optional</small><input value={form.fandom} onChange={(event) => update('fandom', event.target.value)} maxLength={240} /></label></div></SurveyQuestion>}
        {step === 9 && <SurveyQuestion eyebrow="Free keychain claim" title="Where should we contact you about your keychain?" required><div className="survey-fields"><label>Name<input value={form.name} onChange={(event) => update('name', event.target.value)} maxLength={100} required /></label><label>WhatsApp / mobile number<input type="tel" inputMode="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="10-digit Indian mobile number" required /></label></div><fieldset className="survey-consent"><legend>Would you like WOW RIGHT to send you new products and student offers on WhatsApp?</legend><ChoiceGrid values={['Yes, send me new products & student offers.', 'No, only contact me about my free keychain.']} selected={form.marketingConsent === null ? '' : form.marketingConsent ? 'Yes, send me new products & student offers.' : 'No, only contact me about my free keychain.'} onChange={(value) => update('marketingConsent', value.startsWith('Yes'))} /><small>Your answer does not affect your free keychain claim.</small></fieldset></SurveyQuestion>}

        {error && <p className="survey-error" role="alert">{error}</p>}
        <footer className="survey-actions">
          {step > 0 && <button type="button" className="survey-back" onClick={() => { setError(''); setStep((current) => current - 1); }}><ChevronLeft /> Back</button>}
          {step === 0 ? <button type="button" className="button primary" onClick={next}>Start survey</button> : step < 9 ? <button type="button" className="button primary" onClick={next}>Continue</button> : <button type="button" className="button primary" disabled={submitting} onClick={submit}>{submitting ? 'Saving…' : 'Complete survey & get claim code'}</button>}
        </footer>
      </section>
    </main>
  );
}

function SurveyQuestion({ eyebrow, title, required, children }: { eyebrow: string; title: string; required?: boolean; children: React.ReactNode }) {
  return <div className="survey-question"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{required && <small className="survey-required">Required</small>}{children}</div>;
}
