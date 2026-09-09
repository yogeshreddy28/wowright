'use client';
import { useEffect, useState } from 'react';
export function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<
    { id: string; rating: number; body: string; photo: string | null; created_at: string; customer_name: string }[]
  >([]);
  const [summary, setSummary] = useState<{ count: number; average: number; distribution: Record<string, number> }>({ count: 0, average: 0, distribution: {} });
  useEffect(() => {
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d: any) => { setReviews(d.reviews || []); setSummary(d.summary || { count: 0, average: 0, distribution: {} }); })
      .catch(() => {});
  }, [productId]);
  return (
    <section className="section product-reviews">
      <div className="reviews-heading"><div><p className="eyebrow">Real delivered orders</p><h2>Verified-purchase reviews</h2></div>{summary.count > 0 && <div className="review-average"><strong>{summary.average.toFixed(1)}</strong><span aria-label={`${summary.average.toFixed(1)} out of 5 stars`}>{'★'.repeat(Math.round(summary.average))}{'☆'.repeat(5 - Math.round(summary.average))}</span><small>{summary.count} {summary.count === 1 ? 'review' : 'reviews'}</small></div>}</div>
      {!reviews.length ? (
        <div className="review-empty"><b>No verified reviews yet</b><p>Customers can review this product after their order is delivered.</p></div>
      ) : (
        <div className="review-layout"><aside className="review-distribution">{[5,4,3,2,1].map((rating) => <div key={rating}><span>{rating}★</span><progress max={summary.count} value={summary.distribution[String(rating)] || 0} /><small>{summary.distribution[String(rating)] || 0}</small></div>)}</aside><div className="review-list">{reviews.map((r) => (
          <article className="review-card" key={r.id}>
            <header><span aria-label={`${r.rating} out of 5 stars`}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span><b>Verified purchase</b></header>
            <p>{r.body}</p>
            <small>{r.customer_name} · {new Date(r.created_at).toLocaleDateString('en-IN')}</small>
            {r.photo && (
              <img
                src={r.photo}
                alt="Customer’s verified purchase"
                width={240}
                loading="lazy"
              />
            )}
          </article>
        ))}</div></div>
      )}
    </section>
  );
}
export function ReviewForm({ itemId, open = false, onSubmitted }: { itemId: string; open?: boolean; onSubmitted?: () => void }) {
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <details open={open}>
      <summary>Write a review</summary>
      <form
        className="address-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            const form = new FormData(e.currentTarget);
            form.set('orderItemId', itemId);
            const r = await fetch('/api/reviews', {
                method: 'POST',
                body: form,
              }),
              d = (await r.json()) as any;
            setMessage(r.ok ? 'Your review has been saved.' : d.error);
            if (r.ok) onSubmitted?.();
          } catch {
            setMessage('Connection unavailable. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="review-stars"><legend>Your rating</legend>{[1,2,3,4,5].map((n) => <label key={n}><input type="radio" name="rating" value={n} required /><span aria-hidden="true">★</span><span className="sr-only">{n} stars</span></label>)}</fieldset>
        <label>
          Your review
          <textarea name="body" minLength={3} maxLength={2000} required />
        </label>
        <label>
          Optional photo
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
        </label>
        <label className="checkbox-line">
          <input name="photoConsent" type="checkbox" />I have permission to
          publish the optional photo.
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? 'Submitting…' : 'Submit review'}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
