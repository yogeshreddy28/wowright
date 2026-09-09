'use client';
import { EmptyWork } from './workflow-ui';
import { useState } from 'react';
type Row = Record<string, any>;
export function ReviewsAdmin({
  data,
  reload,
}: {
  data: Row;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('');
  async function moderate(
    id: string,
    status: 'published' | 'hidden',
    reason: string,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, reason }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(result.error || 'Could not update review');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update review');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="admin-head">
        <div>
          <h1>Verified reviews</h1>
          <p>
            Reviews are allowed only after delivery. Hide spam, abuse or
            prohibited content—not genuine negative feedback.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="ux-tabs" aria-label="Review visibility">
        {[
          ['', 'All reviews'],
          ['published', 'Visible in store'],
          ['hidden', 'Hidden'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? 'active' : ''}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!data.reviews?.filter((r: Row) => !filter || r.status === filter)
        .length && (
        <EmptyWork
          title="No reviews in this view"
          description="Customers can review their purchases after delivery. No reviews are generated automatically."
        />
      )}
      {data.reviews
        ?.filter((r: Row) => !filter || r.status === filter)
        .map((review: Row) => (
          <section className="detail-card" key={review.id}>
            <h2>{review.product_name || 'Custom purchase'}</h2>
            <p>
              {'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)} · <span className={`ux-chip ${review.status === 'published' ? 'success' : 'warning'}`}>{review.status === 'published' ? 'Visible in store' : 'Hidden · action reviewed'}</span> ·{' '}
              {new Date(review.created_at).toLocaleDateString('en-IN')}
            </p>
            <p>{review.body}</p>
            {review.moderation_reason && (
              <p>Moderation: {review.moderation_reason.replaceAll('_', ' ')}</p>
            )}
            {review.status === 'hidden' ? (
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => moderate(review.id, 'published', 'restored')}
              >
                Restore review
              </button>
            ) : (
              <form
                className="ops-actions"
                onSubmit={(e) => {
                  e.preventDefault();
                  const reason = String(
                    new FormData(e.currentTarget).get('reason'),
                  );
                  void moderate(review.id, 'hidden', reason);
                }}
              >
                <label>
                  Moderation reason
                  <select name="reason" required defaultValue="">
                    <option value="" disabled>
                      Choose a reason
                    </option>
                    <option value="spam">Spam</option>
                    <option value="abuse">Abuse</option>
                    <option value="prohibited_content">
                      Prohibited content
                    </option>
                  </select>
                </label>
                <button disabled={busy} className="button secondary">
                  Hide review
                </button>
              </form>
            )}
          </section>
        ))}
    </>
  );
}
