'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Search, TicketCheck, X } from 'lucide-react';

type Distribution = { label: string; count: number; percentage?: number };
type ResponseRow = {
  id: string;
  submitted_at: string;
  name: string;
  phone: string;
  college: string;
  course: string | null;
  year: string | null;
  age: string;
  interests: string[];
  top_interest: string;
  budget: string;
  buying_driver: string;
  purchase_intent: string;
  product_idea: string | null;
  fandom: string | null;
  marketing_consent: boolean;
  marketing_consent_timestamp: string | null;
  claim_code: string;
  redeemed: boolean;
  redeemed_at: string | null;
};
type SurveyData = {
  summary: {
    total: number;
    today: number;
    marketingOptIns: number;
    definitelyInterested: number;
    redeemed: number;
    pending: number;
  };
  distributions: {
    interests: Distribution[];
    topInterest: Distribution[];
    budgets: Distribution[];
    buyingDrivers: Distribution[];
    purchaseIntents: Distribution[];
    colleges: Distribution[];
  };
  ideas: { id: string; productIdea: string | null; fandom: string | null }[];
  responses: ResponseRow[];
};

const emptyFilters = {
  search: '',
  college: '',
  interest: '',
  topInterest: '',
  budget: '',
  purchaseIntent: '',
  marketingConsent: '',
  redeemed: '',
};

export function SurveysAdmin({
  data,
  reload,
}: {
  data: SurveyData;
  reload: () => Promise<void>;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<ResponseRow | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimResult, setClaimResult] = useState('');
  const [claimLookup, setClaimLookup] = useState<{
    name: string;
    college: string;
    redeemed: boolean;
    redeemedAt: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = (key: keyof ResponseRow) => [
    ...new Set(data.responses.map((row) => String(row[key] || '')).filter(Boolean)),
  ].sort();
  const rows = useMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase('en-IN');
    return data.responses.filter((row) => {
      if (
        query &&
        ![row.name, row.phone, row.claim_code, row.college].some((value) =>
          value.toLocaleLowerCase('en-IN').includes(query),
        )
      )
        return false;
      if (filters.college && row.college !== filters.college) return false;
      if (filters.interest && !row.interests.includes(filters.interest)) return false;
      if (filters.topInterest && row.top_interest !== filters.topInterest) return false;
      if (filters.budget && row.budget !== filters.budget) return false;
      if (filters.purchaseIntent && row.purchase_intent !== filters.purchaseIntent)
        return false;
      if (
        filters.marketingConsent &&
        row.marketing_consent !== (filters.marketingConsent === 'yes')
      )
        return false;
      if (filters.redeemed && row.redeemed !== (filters.redeemed === 'yes'))
        return false;
      return true;
    });
  }, [data.responses, filters]);

  async function claimAction(
    event: FormEvent<HTMLFormElement> | undefined,
    action: 'lookup' | 'redeem',
  ) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setClaimResult('');
    if (action === 'lookup') setClaimLookup(null);
    try {
      const response = await fetch('/api/admin/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimCode, action }),
      });
      const result = (await response.json()) as {
        error?: string;
        respondent?: { name: string; college: string };
        redeemedAt?: string;
        redeemed?: boolean;
      };
      if (!response.ok) {
        if (response.status === 409 && result.respondent)
          setClaimResult(
            `Already redeemed by ${result.respondent.name} on ${new Date(result.redeemedAt || '').toLocaleString('en-IN')}.`,
          );
        else throw new Error(result.error || 'Claim could not be updated.');
      } else if (result.respondent) {
        setClaimLookup({
          name: result.respondent.name,
          college: result.respondent.college,
          redeemed: Boolean(result.redeemed || action === 'redeem'),
          redeemedAt: result.redeemedAt || null,
        });
        if (action === 'redeem') {
          setClaimResult(
            `Redeemed for ${result.respondent.name} · ${result.respondent.college}`,
          );
          await reload();
        }
      }
    } catch (redeemError) {
      setError(
        redeemError instanceof Error
          ? redeemError.message
          : 'Claim could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">Student product research</p>
          <h1>College surveys</h1>
          <p>Understand demand, segment opted-in leads and manage free keychain claims.</p>
        </div>
      </header>
      <div className="survey-admin-stats">
        {[
          ['Total responses', data.summary.total],
          ['Responses today', data.summary.today],
          ['Marketing opt-ins', data.summary.marketingOptIns],
          ['Definitely interested', data.summary.definitelyInterested],
          ['Keychains redeemed', data.summary.redeemed],
          ['Keychains pending', data.summary.pending],
        ].map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>

      <section className="survey-admin-section">
        <div>
          <p className="eyebrow">Keychain desk</p>
          <h2>Redeem a claim</h2>
        </div>
        <form className="survey-claim-lookup" onSubmit={(event) => claimAction(event, 'lookup')}>
          <label>Claim code<input value={claimCode} onChange={(event) => setClaimCode(event.target.value.toUpperCase())} placeholder="WR-S-XXXXXX" required pattern="WR-S-[A-Z2-9]{6}" /></label>
          <button className="button secondary" disabled={busy}><Search /> {busy ? 'Checking…' : 'Find claim'}</button>
        </form>
        {claimLookup && (
          <div className="survey-claim-match">
            <div><strong>{claimLookup.name}</strong><span>{claimLookup.college}</span></div>
            {claimLookup.redeemed ? (
              <span className="ux-chip success">Already redeemed{claimLookup.redeemedAt ? ` · ${new Date(claimLookup.redeemedAt).toLocaleString('en-IN')}` : ''}</span>
            ) : (
              <button className="button primary" type="button" disabled={busy} onClick={() => claimAction(undefined, 'redeem')}><TicketCheck /> Mark keychain as redeemed</button>
            )}
          </div>
        )}
        {claimResult && <p className="form-success" role="status">{claimResult}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <section className="survey-admin-section">
        <p className="eyebrow">What students want</p>
        <h2>Product research</h2>
        <div className="survey-distribution-grid">
          <DistributionCard title="Product interests" items={data.distributions.interests} note="Multi-select: percentages show the share of respondents and do not add to 100%." />
          <DistributionCard title="#1 top interest" items={data.distributions.topInterest} total={data.summary.total} />
          <DistributionCard title="Budget" items={data.distributions.budgets} total={data.summary.total} />
          <DistributionCard title="Buying reason" items={data.distributions.buyingDrivers} total={data.summary.total} />
          <DistributionCard title="Purchase intent" items={data.distributions.purchaseIntents} total={data.summary.total} />
          <DistributionCard title="Colleges" items={data.distributions.colleges.slice(0, 12)} total={data.summary.total} />
        </div>
        {data.ideas.length > 0 && (
          <details className="survey-ideas">
            <summary>Recent product ideas and fandoms ({data.ideas.length})</summary>
            <ul>{data.ideas.map((idea) => <li key={idea.id}>{idea.productIdea && <span><b>Idea:</b> {idea.productIdea}</span>}{idea.fandom && <span><b>Fandom:</b> {idea.fandom}</span>}</li>)}</ul>
          </details>
        )}
      </section>

      <section className="survey-admin-section">
        <div className="survey-response-heading"><div><p className="eyebrow">Responses</p><h2>{rows.length} shown</h2></div><button className="button secondary" type="button" onClick={() => setFilters(emptyFilters)}>Reset filters</button></div>
        <div className="survey-admin-filters">
          <label className="survey-filter-search"><Search /> Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Name, phone, claim or college" /></label>
          <Filter label="College" value={filters.college} values={options('college')} onChange={(college) => setFilters({ ...filters, college })} />
          <Filter label="Interest" value={filters.interest} values={data.distributions.interests.map((item) => item.label)} onChange={(interest) => setFilters({ ...filters, interest })} />
          <Filter label="Top interest" value={filters.topInterest} values={options('top_interest')} onChange={(topInterest) => setFilters({ ...filters, topInterest })} />
          <Filter label="Budget" value={filters.budget} values={options('budget')} onChange={(budget) => setFilters({ ...filters, budget })} />
          <Filter label="Purchase intent" value={filters.purchaseIntent} values={options('purchase_intent')} onChange={(purchaseIntent) => setFilters({ ...filters, purchaseIntent })} />
          <Filter label="Marketing consent" value={filters.marketingConsent} values={['yes', 'no']} labels={{ yes: 'Yes', no: 'No' }} onChange={(marketingConsent) => setFilters({ ...filters, marketingConsent })} />
          <Filter label="Keychain" value={filters.redeemed} values={['no', 'yes']} labels={{ no: 'Pending', yes: 'Redeemed' }} onChange={(redeemed) => setFilters({ ...filters, redeemed })} />
        </div>
        <div className="survey-table-wrap">
          <table className="survey-response-table">
            <thead><tr><th>Date</th><th>Name</th><th>Phone</th><th>College</th><th>Age</th><th>Top interest</th><th>Budget</th><th>Intent</th><th>Marketing</th><th>Claim</th><th>Keychain</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setSelected(row); }}><td>{new Date(row.submitted_at).toLocaleDateString('en-IN')}</td><td><button type="button">{row.name}</button></td><td>{row.phone}</td><td>{row.college}</td><td>{row.age}</td><td>{row.top_interest}</td><td>{row.budget}</td><td>{row.purchase_intent}</td><td>{row.marketing_consent ? 'Yes' : 'No'}</td><td><code>{row.claim_code}</code></td><td><span className={`ux-chip ${row.redeemed ? 'success' : 'warning'}`}>{row.redeemed ? 'Redeemed' : 'Pending'}</span></td></tr>)}</tbody>
          </table>
          {!rows.length && <p className="survey-empty">No responses match these filters.</p>}
        </div>
      </section>

      {selected && <ResponseDetail response={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function DistributionCard({ title, items, total, note }: { title: string; items: Distribution[]; total?: number; note?: string }) {
  return <article className="survey-distribution"><h3>{title}</h3>{items.length ? items.slice(0, 12).map((item) => { const percentage = item.percentage ?? (total ? Math.round((item.count / total) * 100) : 0); return <div key={item.label}><span>{item.label}</span><b>{item.count} <small>{percentage}%</small></b><i><span style={{ width: `${percentage}%` }} /></i></div>; }) : <p>No responses yet.</p>}{note && <small>{note}</small>}</article>;
}

function Filter({ label, value, values, labels = {}, onChange }: { label: string; value: string; values: string[]; labels?: Record<string, string>; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">All</option>{values.map((option) => <option key={option} value={option}>{labels[option] || option}</option>)}</select></label>;
}

function ResponseDetail({ response, onClose }: { response: ResponseRow; onClose: () => void }) {
  return <div className="survey-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="survey-detail" role="dialog" aria-modal="true" aria-label={`Survey response from ${response.name}`}><button className="survey-detail-close" type="button" onClick={onClose} aria-label="Close response"><X /></button><p className="eyebrow">{response.claim_code}</p><h2>{response.name}</h2><p>{response.phone} · {response.college}</p><dl><div><dt>Age</dt><dd>{response.age}</dd></div><div><dt>Course / year</dt><dd>{[response.course, response.year].filter(Boolean).join(' · ') || 'Not provided'}</dd></div><div><dt>Selected interests</dt><dd>{response.interests.join(', ')}</dd></div><div><dt>Top interest</dt><dd>{response.top_interest}</dd></div><div><dt>Budget</dt><dd>{response.budget}</dd></div><div><dt>Buying reason</dt><dd>{response.buying_driver}</dd></div><div><dt>Purchase intent</dt><dd>{response.purchase_intent}</dd></div><div><dt>Product idea</dt><dd>{response.product_idea || 'Not provided'}</dd></div><div><dt>Fandom / hobby</dt><dd>{response.fandom || 'Not provided'}</dd></div><div><dt>Marketing consent</dt><dd>{response.marketing_consent ? `Yes · ${new Date(response.marketing_consent_timestamp || response.submitted_at).toLocaleString('en-IN')}` : 'No — keychain contact only'}</dd></div><div><dt>Keychain</dt><dd>{response.redeemed ? <><CheckCircle2 /> Redeemed {response.redeemed_at && new Date(response.redeemed_at).toLocaleString('en-IN')}</> : 'Pending'}</dd></div></dl></section></div>;
}
