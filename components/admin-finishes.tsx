'use client';

import { FormEvent, useState } from 'react';
import { Check, ImagePlus, Palette, Plus } from 'lucide-react';
import { slugifyProduct } from '@/lib/services/product-admin';

type Finish = {
  id: string;
  name: string;
  slug: string;
  swatch?: string;
  active: boolean | number;
  sort_order: number;
  internal_notes?: string;
  reference_image?: string;
  reference_image_id?: string;
};

export function AdminFinishes({
  data,
  reload,
}: {
  data: { finishes?: Finish[] };
  reload: () => void;
}) {
  const [editing, setEditing] = useState<Record<string, Partial<Finish>>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const finishes = data.finishes || [];

  async function request(
    method: 'POST' | 'PATCH',
    body: Record<string, unknown>,
  ) {
    setError('');
    setMessage('');
    setBusy(String(body.id || 'new'));
    try {
      const response = await fetch('/api/admin/finishes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || 'Finish could not be saved.');
      setMessage(
        method === 'POST'
          ? 'Finish added to the universal library.'
          : 'Finish updated.',
      );
      if (method === 'POST') {
        const form =
          document.querySelector<HTMLFormElement>('#new-finish-form');
        form?.reset();
      }
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Finish could not be saved.',
      );
    } finally {
      setBusy('');
    }
  }

  async function upload(finish: Finish, file?: File) {
    if (!file) return;
    setBusy(finish.id);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('globalFinishId', finish.id);
      const response = await fetch('/api/admin/product-images', {
        method: 'POST',
        body: form,
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(
          result.error || 'Reference image could not be uploaded.',
        );
      if (finish.reference_image_id) {
        await fetch(
          `/api/admin/product-images?id=${encodeURIComponent(finish.reference_image_id)}`,
          { method: 'DELETE' },
        );
      }
      setMessage(`${finish.name} reference image updated.`);
      reload();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Reference image could not be uploaded.',
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">Universal catalogue library</p>
          <h1>Finishes & Colours</h1>
          <p>Create each real finish once, then assign it to any product.</p>
        </div>
      </header>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="finish-library-intro">
        <Palette />
        <div>
          <b>Product photos and finish references stay separate.</b>
          <p>
            A reference shows colour or material only. Product-specific photos
            are assigned inside each product.
          </p>
        </div>
      </section>
      <form
        id="new-finish-form"
        className="finish-create-form"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const name = String(values.get('name') || '');
          request('POST', {
            name,
            slug: slugifyProduct(String(values.get('slug') || name)),
            swatch: String(values.get('swatch') || ''),
            internalNotes: String(values.get('internalNotes') || ''),
            active: true,
          });
        }}
      >
        <label>
          Name
          <input name="name" placeholder="e.g. Copper Silk" required />
        </label>
        <label>
          Slug (optional)
          <input name="slug" placeholder="Generated from name" />
        </label>
        <label>
          Swatch
          <input name="swatch" type="color" defaultValue="#2c2926" />
        </label>
        <label className="wide">
          Internal note
          <input name="internalNotes" placeholder="Optional Admin-only note" />
        </label>
        <button className="button primary" disabled={busy === 'new'}>
          <Plus /> Add finish
        </button>
      </form>
      <div className="finish-library-grid">
        {finishes.map((finish) => {
          const draft = { ...finish, ...editing[finish.id] };
          return (
            <article
              key={finish.id}
              className={!draft.active ? 'inactive' : ''}
            >
              <div className="finish-library-image">
                {finish.reference_image ? (
                  <img
                    src={finish.reference_image}
                    alt={`${finish.name} colour and material reference`}
                  />
                ) : (
                  <span>
                    <ImagePlus />
                    <small>No reference image</small>
                  </span>
                )}
                <label>
                  {finish.reference_image
                    ? 'Replace reference'
                    : 'Upload reference'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) =>
                      upload(finish, event.target.files?.[0])
                    }
                  />
                </label>
              </div>
              <div className="finish-library-fields">
                <label>
                  Name
                  <input
                    value={String(draft.name || '')}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          name: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Slug
                  <input
                    value={String(draft.slug || '')}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          slug: slugifyProduct(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Swatch
                  <input
                    type="color"
                    value={String(draft.swatch || '#2c2926')}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          swatch: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label>
                  Order
                  <input
                    type="number"
                    min="0"
                    value={Number(draft.sort_order || 0)}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          sort_order: Number(event.target.value),
                        },
                      }))
                    }
                  />
                </label>
                <label className="wide">
                  Internal note
                  <input
                    value={String(draft.internal_notes || '')}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          internal_notes: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="finish-active">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.active)}
                    onChange={(event) =>
                      setEditing((value) => ({
                        ...value,
                        [finish.id]: {
                          ...value[finish.id],
                          active: event.target.checked,
                        },
                      }))
                    }
                  />{' '}
                  Available for product assignment
                </label>
              </div>
              <button
                className="button secondary"
                disabled={busy === finish.id}
                onClick={() =>
                  request('PATCH', {
                    id: finish.id,
                    name: draft.name,
                    slug: draft.slug,
                    swatch: draft.swatch || '',
                    active: Boolean(draft.active),
                    sortOrder: Number(draft.sort_order || 0),
                    internalNotes: draft.internal_notes || '',
                  })
                }
              >
                <Check /> Save finish
              </button>
            </article>
          );
        })}
      </div>
      {!finishes.length && (
        <div className="admin-empty">
          No universal finishes yet. Add only finishes the business actually
          offers.
        </div>
      )}
    </>
  );
}
