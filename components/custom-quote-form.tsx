'use client';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { useStore } from './store-provider';
export function CustomQuoteForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState('');
  const [handoff, setHandoff] = useState('');
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const { sessionId } = useStore();
  useEffect(() => {
    fetch('/api/account')
      .then(async (response) => {
        if (!response.ok) {
          setSignedIn(false);
          return;
        }
        const { customer } = (await response.json()) as {
          customer: { name: string; mobile: string; email?: string };
        };
        setSignedIn(true);
        for (const [key, value] of Object.entries({
          name: customer.name,
          mobile: customer.mobile.replace(/^91/, ''),
          email: customer.email || '',
        })) {
          const field = form.current?.elements.namedItem(key);
          if (field instanceof HTMLInputElement && !field.value)
            field.value = value;
        }
      })
      .catch(() => setSignedIn(false));
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const data = new FormData(e.currentTarget);
    data.set('sessionId', sessionId);
    const productId = new URLSearchParams(window.location.search).get(
      'product',
    );
    if (productId) data.set('productId', productId);
    files.forEach((f) => data.append('files', f));
    try {
      const r = await fetch('/api/custom-quotes', {
        method: 'POST',
        body: data,
      });
      const json = (await r.json()) as {
        requestNumber?: string;
        error?: string;
        url?: string;
      };
      if (!r.ok) throw new Error(json.error);
      setDone(json.requestNumber || 'Saved');
      setHandoff(json.url || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }
  if (done)
    return (
      <div className="quote-success">
        <CheckCircle2 />
        <p className="eyebrow">Request received</p>
        <h2>We have your idea.</h2>
        <p>
          Your reference is <b>{done}</b>. We’ll review the details and contact
          you—your files remain private.
        </p>
        {handoff && (
          <a className="button whatsapp" href={handoff}>
            Discuss on WhatsApp
          </a>
        )}
        <Link className="button secondary" href="/account/quotes">
          View requests & approve quote
        </Link>
      </div>
    );
  return (
    <form ref={form} className="quote-form" onSubmit={submit}>
      {signedIn === false && (
        <p className="ux-warning">
          Sign in before sending your idea so you can save and approve the
          quote. <Link href="/account">Sign in / Create account</Link>.
        </p>
      )}
      {signedIn === true && (
        <p className="ux-help">
          Your request will appear in{' '}
          <Link href="/account/quotes">My custom requests</Link>.
        </p>
      )}
      <p className="ux-help">
        Review and approve the quote before paying. Custom orders require full
        prepaid UPI before production; COD is not available.
      </p>
      <div className="field-grid">
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Mobile
          <input name="mobile" required inputMode="tel" />
        </label>
        <label className="wide">
          Email <small>optional</small>
          <input name="email" type="email" />
        </label>
        <label className="wide">
          Describe your idea
          <textarea
            name="description"
            required
            rows={5}
            placeholder="What should it be, who is it for, and how will it be used?"
          />
        </label>
        <label>
          Approximate dimensions
          <input name="dimensions" placeholder="e.g. 20 × 12 × 5 cm" />
        </label>
        <label>
          Quantity
          <input
            name="quantity"
            type="number"
            min="1"
            defaultValue="1"
            required
          />
        </label>
        <label>
          Desired colour
          <input name="desiredColour" />
        </label>
        <label>
          Budget <small>optional</small>
          <input name="budget" type="number" min="0" placeholder="₹" />
        </label>
        <label>
          Required by <small>optional</small>
          <input name="requiredBy" type="date" />
        </label>
        <label>
          Additional notes
          <textarea name="notes" />
        </label>
      </div>
      <label className="upload-zone">
        <FileUp />
        <b>Add reference files</b>
        <span>STL, 3MF, OBJ, STEP, JPG, PNG, WEBP or PDF · max 15 MB each</span>
        <input
          type="file"
          multiple
          accept=".stl,.3mf,.obj,.step,.stp,.jpg,.jpeg,.png,.webp,.pdf"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
        />
        {files.length > 0 && (
          <small>{files.map((f) => f.name).join(', ')}</small>
        )}
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="spin" /> Sending securely…
          </>
        ) : (
          'Request a custom quote'
        )}
      </button>
      <p className="privacy-note">
        Files are stored privately and are only available to the production
        team.
      </p>
    </form>
  );
}
