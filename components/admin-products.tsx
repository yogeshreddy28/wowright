'use client';
import { productReadiness, dateLabel } from '@/lib/workflow-presentation';
import { EmptyWork } from './workflow-ui';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileUp,
  ImagePlus,
  PackagePlus,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { slugifyProduct } from '@/lib/services/product-admin';

type Props = { data: { products?: any[] }; reload: () => void };
type ImageRow = {
  id: string;
  url: string;
  role: string;
  alt_text?: string;
  sort_order: number;
};
type Variant = {
  id?: string;
  finishId?: string;
  name: string;
  sku?: string;
  sellingPrice?: number;
  originalPrice?: number;
  priceAdjustment: number;
  enabled: boolean;
  availability: string;
  exactImageId?: string;
  exactImageIds: string[];
  sortOrder: number;
};
const tabs = [
  'Basic Info',
  'Pricing & Variants',
  'Images',
  'Product Details',
  'Production',
  'SEO',
  'Publishing',
  'Advanced JSON',
] as const;
const blank = {
  id: '',
  name: '',
  categoryId: '',
  slug: '',
  slugManual: false,
  sku: '',
  skuManual: false,
  shortDescription: '',
  description: '',
  basePrice: 0,
  productType: 'normal',
  internalUnitCost: '',
  compareAtPrice: undefined as number | undefined,
  stockMode: 'made_to_order',
  leadTime: '',
  material: 'PLA',
  width: undefined as number | undefined,
  depth: undefined as number | undefined,
  height: undefined as number | undefined,
  dimensionUnit: 'cm',
  dimensionDisplayOverride: '',
  deliveryNotes: '',
  careInstructions: '',
  commercialLicenseStatus: 'unchecked',
  estimatedPrintMinutes: undefined as number | undefined,
  filamentGrams: undefined as number | undefined,
  supportDifficulty: '',
  printProfileNotes: '',
  internalProductionNotes: '',
  seoTitle: '',
  seoDescription: '',
  publishingStatus: 'draft',
  availability: 'available',
  featured: false,
  tags: [] as string[],
  relatedProductIds: [] as string[],
  variants: [] as Variant[],
  images: [] as ImageRow[],
  legacyImages: [] as string[],
};

function TextField({
  label,
  value,
  onChange,
  wide = false,
  required = false,
  type = 'text',
  ...rest
}: any) {
  return (
    <label className={wide ? 'wide' : ''}>
      {label}
      <input
        type={type}
        value={value ?? ''}
        required={required}
        onChange={(e) =>
          onChange(
            type === 'number'
              ? e.target.value === ''
                ? undefined
                : Number(e.target.value)
              : e.target.value,
          )
        }
        {...rest}
      />
    </label>
  );
}
function Area({ label, value, onChange, wide = true, placeholder }: any) {
  return (
    <label className={wide ? 'wide' : ''}>
      {label}
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

export function AdminProducts({ data, reload }: Props) {
  const [categories, setCategories] = useState<any[]>([]),
    [finishes, setFinishes] = useState<any[]>([]),
    [defaults, setDefaults] = useState<any>({});
  const [editor, setEditor] = useState<any>(null),
    [tab, setTab] = useState<(typeof tabs)[number]>('Basic Info'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [search, setSearch] = useState(''),
    [categoryFilter, setCategoryFilter] = useState(''),
    [publishingFilter, setPublishingFilter] = useState(''),
    [availabilityFilter, setAvailabilityFilter] = useState(''),
    [licenceFilter, setLicenceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [needsInfo, setNeedsInfo] = useState(false);
  const [showImport, setShowImport] = useState(false),
    [importFormat, setImportFormat] = useState<'csv' | 'json'>('csv'),
    [importContent, setImportContent] = useState(''),
    [importPreview, setImportPreview] = useState<any>(null);
  const [showManagers, setShowManagers] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [savedJsonText, setSavedJsonText] = useState('');
  const [jsonPreview, setJsonPreview] = useState<any>(null);
  const [jsonWarnings, setJsonWarnings] = useState<string[]>([]);
  async function loadMeta() {
    const [c, f, s] = (await Promise.all([
      fetch('/api/admin/categories').then((r) => r.json()),
      fetch('/api/admin/finishes').then((r) => r.json()),
      fetch('/api/admin/settings').then((r) => r.json()),
    ])) as any[];
    setCategories(c.categories || []);
    setFinishes(f.finishes || []);
    setDefaults(s.settings || {});
  }
  useEffect(() => {
    loadMeta().catch(() => setError('Could not load product settings.'));
  }, []);
  const products = useMemo(
    () =>
      (data.products || []).filter(
        (p) =>
          (!typeFilter ||
            (p.product_type === 'customizable' || p.stock_mode === 'quote_only'
              ? 'customizable'
              : 'normal') === typeFilter) &&
          (!needsInfo || productReadiness(p).length > 0) &&
          (!search ||
            `${p.name} ${p.sku || ''} ${p.slug}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!categoryFilter || p.category_id === categoryFilter) &&
          (!publishingFilter || p.publishing_status === publishingFilter) &&
          (!availabilityFilter || p.availability === availabilityFilter) &&
          (!licenceFilter || p.commercial_license_status === licenceFilter),
      ),
    [
      data.products,
      typeFilter,
      needsInfo,
      search,
      categoryFilter,
      publishingFilter,
      availabilityFilter,
      licenceFilter,
    ],
  );
  function set<K extends string>(key: K, value: any) {
    setEditor((current: any) => ({ ...current, [key]: value }));
    setError('');
  }
  function startNew() {
    setEditor({
      ...blank,
      material: defaults.productDefaultMaterial || 'PLA',
      stockMode: defaults.productDefaultStockMode || 'made_to_order',
      leadTime: defaults.productDefaultLeadTime || '',
    });
    setTab('Basic Info');
    setError('');
  }
  async function edit(id: string) {
    setBusy(true);
    const r = await fetch(`/api/admin/products/${id}`),
      d = (await r.json()) as any;
    setBusy(false);
    if (!r.ok) {
      setError(d.error);
      return;
    }
    const p = d.product;
    setEditor({
      ...blank,
      id: p.id,
      name: p.name,
      categoryId: p.category_id || '',
      slug: p.slug,
      slugManual: true,
      sku: p.sku || '',
      skuManual: true,
      shortDescription: p.short_description || '',
      description: p.description || '',
      basePrice: p.base_price || 0,
      productType: p.product_type || 'normal',
      internalUnitCost: p.internal_unit_cost ?? '',
      compareAtPrice: p.compare_at_price ?? undefined,
      stockMode: p.stock_mode || 'made_to_order',
      leadTime: p.lead_time || '',
      material: p.material || '',
      width: p.width ?? undefined,
      depth: p.depth ?? undefined,
      height: p.height ?? undefined,
      dimensionUnit: p.dimension_unit || 'cm',
      dimensionDisplayOverride: p.dimension_display_override || '',
      deliveryNotes: p.delivery_notes || '',
      careInstructions: p.care_instructions || '',
      commercialLicenseStatus: p.commercial_license_status || 'unchecked',
      estimatedPrintMinutes: p.estimated_print_minutes ?? undefined,
      filamentGrams: p.filament_grams ?? undefined,
      supportDifficulty: p.support_difficulty || '',
      printProfileNotes: p.print_profile_notes || '',
      internalProductionNotes: p.internal_production_notes || '',
      seoTitle: p.seo_title || '',
      seoDescription: p.seo_description || '',
      publishingStatus: p.publishing_status || 'draft',
      availability: p.availability || 'available',
      featured: Boolean(p.featured),
      tags: p.tags || [],
      relatedProductIds: p.relatedProductIds || [],
      variants: (p.variants || []).map((v: any) => ({
        id: v.id,
        finishId: v.finish_id || '',
        name: v.name,
        sku: v.sku,
        sellingPrice: v.selling_price ?? undefined,
        originalPrice: v.original_price ?? undefined,
        priceAdjustment: v.price_adjustment || 0,
        enabled: Boolean(v.active),
        availability: v.availability || 'available',
        exactImageId: v.exact_image_id || '',
        exactImageIds:
          v.exact_image_ids || (v.exact_image_id ? [v.exact_image_id] : []),
        sortOrder: v.sort_order || 0,
      })),
      images: p.images || [],
      legacyImages: p.legacyImages || [],
    });
    setTab('Basic Info');
  }
  function payload(status?: 'draft' | 'published') {
    const { images: _images, legacyImages: _legacyImages, ...value } = editor;
    return {
      ...value,
      publishingStatus: status || value.publishingStatus,
      slug: value.slug || undefined,
      sku: value.sku || undefined,
      tags: value.tags.map((x: string) => x.trim()).filter(Boolean),
      supportDifficulty: value.supportDifficulty || undefined,
    };
  }
  async function loadProductJson(id: string) {
    setBusy(true);
    setError('');
    const response = await fetch(`/api/admin/products/${id}/json`, {
      cache: 'no-store',
    });
    const result = (await response.json()) as any;
    setBusy(false);
    if (!response.ok) {
      setError(result.error || 'Could not load the saved Product JSON.');
      return;
    }
    const canonical = JSON.stringify(result.product, null, 2);
    setJsonText(canonical);
    setSavedJsonText(canonical);
    setJsonPreview(null);
    setJsonWarnings([]);
  }
  async function submitJson(mode: 'preview' | 'save') {
    setError('');
    setNotice('');
    let product: unknown;
    try {
      product = JSON.parse(jsonText);
    } catch {
      setError('JSON syntax is invalid. Check commas, quotes and brackets.');
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/admin/products/${editor.id}/json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, product }),
    });
    const result = (await response.json()) as any;
    setBusy(false);
    if (!response.ok) {
      setError(
        result.errors?.join(' ') ||
          result.error ||
          'JSON could not be validated.',
      );
      return;
    }
    const canonical = JSON.stringify(result.product, null, 2);
    setJsonText(canonical);
    setJsonWarnings(result.warnings || []);
    if (mode === 'preview') {
      setJsonPreview(result.summary);
      setNotice('JSON normalized. Review the changes before saving.');
    } else {
      setSavedJsonText(canonical);
      setJsonPreview(null);
      setNotice('Product JSON saved and reloaded from the catalogue.');
      await edit(editor.id);
      setTab('Advanced JSON');
      reload();
    }
  }
  async function save(status?: 'draft' | 'published') {
    setBusy(true);
    setError('');
    setNotice('');
    const r = await fetch('/api/admin/products', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(status)),
      }),
      d = (await r.json()) as any;
    setBusy(false);
    if (!r.ok) {
      setError(d.errors?.join(' ') || d.error || 'Could not save product.');
      return;
    }
    setNotice(status === 'published' ? 'Product published.' : 'Draft saved.');
    reload();
    await edit(d.id || editor.id);
  }
  async function duplicate(product: any) {
    if (!confirm(`Duplicate ${product.name} as a new draft?`)) return;
    const r = await fetch(`/api/admin/products/${product.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copyImages: false }),
      }),
      d = (await r.json()) as any;
    if (!r.ok) setError(d.error);
    else {
      setNotice('Product duplicated as a draft. Images were not copied.');
      reload();
      await edit(d.id);
    }
  }
  async function quick(id: string, action: string) {
    const r = await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const d = (await r.json()) as any;
    if (!r.ok) setError(d.error);
    else reload();
  }
  async function upload(
    e: ChangeEvent<HTMLInputElement>,
    role: 'main' | 'gallery',
    globalFinishId?: string,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!editor?.id && !globalFinishId) {
      setError('Save the product as a draft before uploading images.');
      return;
    }
    const form = new FormData();
    form.set('file', file);
    form.set('role', globalFinishId ? 'finish_reference' : role);
    if (globalFinishId) form.set('globalFinishId', globalFinishId);
    else form.set('productId', editor.id);
    setBusy(true);
    const r = await fetch('/api/admin/product-images', {
        method: 'POST',
        body: form,
      }),
      d = (await r.json()) as any;
    setBusy(false);
    e.target.value = '';
    if (!r.ok) setError(d.error);
    else if (globalFinishId) loadMeta();
    else edit(editor.id);
  }
  async function imageAction(
    id: string,
    action: 'main' | 'delete' | 'up' | 'down',
    sortOrder = 0,
  ) {
    const r =
      action === 'delete'
        ? await fetch(`/api/admin/product-images?id=${id}`, {
            method: 'DELETE',
          })
        : await fetch('/api/admin/product-images', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id,
              ...(action === 'main'
                ? { role: 'main' }
                : {
                    sortOrder: Math.max(
                      0,
                      sortOrder + (action === 'up' ? -1 : 1),
                    ),
                  }),
            }),
          });
    if (!r.ok) setError(((await r.json()) as any).error);
    else edit(editor.id);
  }
  async function runImport(mode: 'dry-run' | 'commit') {
    setBusy(true);
    const r = await fetch('/api/admin/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          format: importFormat,
          content: importContent,
        }),
      }),
      d = (await r.json()) as any;
    setBusy(false);
    setImportPreview(d);
    if (r.ok && mode === 'commit') {
      setNotice(`${d.imported} products imported as drafts.`);
      setShowImport(false);
      setImportContent('');
      reload();
    }
  }
  return (
    <>
      <div className="admin-head">
        <div>
          <p className="eyebrow">Your product catalogue</p>
          <h1>Products</h1>
          <p>
            Review your drafts, add the missing details, then publish each
            product when it is ready.
          </p>
        </div>
        <div className="admin-head-actions">
          <button
            className="button secondary"
            onClick={() => setShowManagers(!showManagers)}
          >
            <Settings2 /> Categories & finishes
          </button>
          <button
            className="button secondary"
            onClick={() => setShowImport(true)}
          >
            <FileUp /> Bulk import
          </button>
          <button className="button primary" onClick={startNew}>
            <PackagePlus /> Create product
          </button>
        </div>
      </div>
      {error && <p className="form-error admin-product-message">{error}</p>}
      {notice && <p className="form-success admin-product-message">{notice}</p>}
      {showManagers && (
        <Managers
          categories={categories}
          finishes={finishes}
          reload={loadMeta}
          upload={upload}
        />
      )}
      <div className="ux-catalog-summary">
        <button
          className={!publishingFilter && !needsInfo ? 'active' : ''}
          onClick={() => {
            setPublishingFilter('');
            setNeedsInfo(false);
          }}
        >
          All products <b>{(data.products || []).length}</b>
        </button>
        <button
          className={publishingFilter === 'draft' ? 'active' : ''}
          onClick={() => {
            setPublishingFilter('draft');
            setNeedsInfo(false);
          }}
        >
          Drafts{' '}
          <b>
            {
              (data.products || []).filter(
                (p) => p.publishing_status === 'draft',
              ).length
            }
          </b>
        </button>
        <button
          className={publishingFilter === 'published' ? 'active' : ''}
          onClick={() => {
            setPublishingFilter('published');
            setNeedsInfo(false);
          }}
        >
          Published{' '}
          <b>
            {
              (data.products || []).filter(
                (p) => p.publishing_status === 'published',
              ).length
            }
          </b>
        </button>
        <button
          className={needsInfo ? 'active' : ''}
          onClick={() => {
            setPublishingFilter('');
            setNeedsInfo(!needsInfo);
          }}
        >
          Needs information{' '}
          <b>
            {
              (data.products || []).filter(
                (p) => productReadiness(p).length > 0,
              ).length
            }
          </b>
        </button>
      </div>
      <p className="ux-help">
        Drafts are hidden from customers. Imports stay as drafts until you
        explicitly publish them.
      </p>
      <div className="ux-catalog-types">
        <span>Product type</span>
        {[
          ['', 'All'],
          ['normal', 'Normal products'],
          ['customizable', 'Custom / quote-only'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={typeFilter === id ? 'active' : ''}
            aria-pressed={typeFilter === id}
            onClick={() => setTypeFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="catalog-filters">
        <label className="catalog-search">
          <Search />
          <input
            aria-label="Search products"
            placeholder="Search name, SKU or slug"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Category filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Publishing filter"
          value={publishingFilter}
          onChange={(e) => setPublishingFilter(e.target.value)}
        >
          <option value="">Draft & published</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select
          aria-label="Availability filter"
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value)}
        >
          <option value="">All availability</option>
          <option value="available">Available</option>
          <option value="temporarily_unavailable">
            Temporarily unavailable
          </option>
          <option value="discontinued">Discontinued</option>
        </select>
        <select
          aria-label="Licence filter"
          value={licenceFilter}
          onChange={(e) => setLicenceFilter(e.target.value)}
        >
          <option value="">All licences</option>
          <option value="unchecked">Unchecked</option>
          <option value="commercial_verified">Commercial verified</option>
          <option value="personal_only">Personal use only</option>
          <option value="restricted">Restricted / review</option>
        </select>
      </div>
      <div className="admin-table-wrap product-table ux-catalog-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price / finishes</th>
              <th>Readiness</th>
              <th>Visibility</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const missing = productReadiness(p),
                custom =
                  p.product_type === 'customizable' ||
                  p.stock_mode === 'quote_only';
              return (
                <tr key={p.id}>
                  <td>
                    <div className="admin-product-cell">
                      {p.main_image || p.images?.[0] ? (
                        <img src={p.main_image || p.images[0]} alt="" />
                      ) : (
                        <span className="admin-image-empty">
                          <ImagePlus />
                        </span>
                      )}
                      <div>
                        <button
                          className="ux-product-name"
                          onClick={() => edit(p.id)}
                        >
                          {p.name}
                        </button>
                        <small>
                          {custom ? 'Custom / Quote-only' : 'Normal product'}
                          {p.featured ? ' · Featured' : ''}
                        </small>
                        <small>{p.sku || 'SKU created on save'}</small>
                      </div>
                    </div>
                  </td>
                  <td>{p.category_name || p.category}</td>
                  <td>
                    <strong>
                      {custom
                        ? 'Request a quote'
                        : formatMoney(
                            Number(p.starting_price || p.base_price || 0),
                          )}
                    </strong>
                    <small>
                      {p.variant_count
                        ? String(p.variant_count) +
                          (Number(p.variant_count) === 1
                            ? ' finish'
                            : ' finishes')
                        : 'Base product'}
                    </small>
                  </td>
                  <td>
                    {missing.length ? (
                      <span className="ux-readiness warning">
                        {missing.length}{' '}
                        {missing.length === 1 ? 'check' : 'checks'} needed
                      </span>
                    ) : (
                      <span className="ux-readiness">Basic details added</span>
                    )}
                    <small>
                      {missing.length
                        ? missing.join(' · ')
                        : p.publishing_status === 'published'
                          ? 'Visible in your store'
                          : 'Review details before publishing'}
                    </small>
                    <small>
                      {p.commercial_license_status === 'commercial_verified'
                        ? 'Commercial use verified'
                        : 'Licence: ' +
                          String(
                            p.commercial_license_status || 'unchecked',
                          ).replaceAll('_', ' ')}
                    </small>
                  </td>
                  <td>
                    <span
                      className={
                        'ux-chip ' +
                        (p.publishing_status === 'published'
                          ? 'success'
                          : 'neutral')
                      }
                    >
                      {p.publishing_status === 'published'
                        ? 'Published'
                        : 'Draft · hidden'}
                    </span>
                    <small>
                      {p.availability === 'available'
                        ? 'Availability: available'
                        : String(p.availability || 'available').replaceAll(
                            '_',
                            ' ',
                          )}
                    </small>
                  </td>
                  <td>
                    {dateLabel(p.updated_at)}
                    <small>{p.lead_time || 'Lead time not set'}</small>
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => edit(p.id)}
                    >
                      Edit product
                    </button>
                    <details className="ux-product-more">
                      <summary>More actions</summary>
                      <button onClick={() => duplicate(p)}>
                        <Copy size={13} />
                        Duplicate as draft
                      </button>
                      {p.publishing_status === 'published' && (
                        <button onClick={() => quick(p.id, 'unpublish')}>
                          Unpublish
                        </button>
                      )}
                      <button
                        onClick={() =>
                          quick(
                            p.id,
                            p.availability === 'available'
                              ? 'unavailable'
                              : 'available',
                          )
                        }
                      >
                        {p.availability === 'available'
                          ? 'Mark unavailable'
                          : 'Mark available'}
                      </button>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!products.length && (
          <EmptyWork
            title="No products match"
            description="Try clearing a filter or searching another name."
          />
        )}
      </div>
      <p className="ux-help">
        {products.length} of {(data.products || []).length} products shown ·
        Editing does not publish a draft.
      </p>
      {editor && (
        <div className="product-editor-backdrop">
          <section
            className="product-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Product editor"
          >
            <header>
              <div>
                <p className="eyebrow">
                  {editor.id ? 'Edit product' : 'New draft'}
                </p>
                <h2>{editor.name || 'Untitled product'}</h2>
                <small>{editor.sku || 'SKU will be generated on save'}</small>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditor(null)}
                aria-label="Close editor"
              >
                <X />
              </button>
            </header>
            <nav className="product-tabs">
              {tabs.map((item) => (
                <button
                  className={tab === item ? 'active' : ''}
                  onClick={() => {
                    setTab(item);
                    if (item === 'Advanced JSON' && editor.id)
                      void loadProductJson(editor.id);
                  }}
                  key={item}
                >
                  {item}
                </button>
              ))}
            </nav>
            <div className="product-editor-body">
              {tab === 'Basic Info' && (
                <div className="field-grid">
                  <TextField
                    label="Product name"
                    required
                    value={editor.name}
                    onChange={(v: string) => {
                      set('name', v);
                      if (!editor.slugManual) set('slug', slugifyProduct(v));
                    }}
                  />
                  <label>
                    Category
                    <select
                      required
                      value={editor.categoryId}
                      onChange={(e) => set('categoryId', e.target.value)}
                    >
                      <option value="">Choose category</option>
                      {categories
                        .filter((c) => c.active)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <TextField
                    label="SKU (leave blank to auto-generate)"
                    value={editor.sku}
                    onChange={(v: string) => {
                      set('sku', v.toUpperCase());
                      set('skuManual', Boolean(v));
                    }}
                  />
                  <TextField
                    label="URL slug"
                    required
                    value={editor.slug}
                    onChange={(v: string) => {
                      set('slug', slugifyProduct(v));
                      set('slugManual', true);
                    }}
                  />
                  <Area
                    label="Short description"
                    value={editor.shortDescription}
                    onChange={(v: string) => set('shortDescription', v)}
                    placeholder="Concise customer-facing summary"
                  />
                </div>
              )}
              {tab === 'Pricing & Variants' && (
                <Pricing editor={editor} set={set} finishes={finishes} />
              )}
              {tab === 'Images' && (
                <Images editor={editor} upload={upload} action={imageAction} />
              )}
              {tab === 'Product Details' && (
                <div className="field-grid">
                  <Area
                    label="Description"
                    value={editor.description}
                    onChange={(v: string) => set('description', v)}
                  />
                  <TextField
                    label="Material override"
                    value={editor.material}
                    onChange={(v: string) => set('material', v)}
                    placeholder={
                      defaults.productDefaultMaterial || 'Global default'
                    }
                  />
                  <TextField
                    label="Width"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.width}
                    onChange={(v: number) => set('width', v)}
                  />
                  <TextField
                    label="Depth"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.depth}
                    onChange={(v: number) => set('depth', v)}
                  />
                  <TextField
                    label="Height"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.height}
                    onChange={(v: number) => set('height', v)}
                  />
                  <label>
                    Unit
                    <select
                      value={editor.dimensionUnit}
                      onChange={(e) => set('dimensionUnit', e.target.value)}
                    >
                      <option value="mm">mm</option>
                      <option value="cm">cm</option>
                      <option value="in">inches</option>
                    </select>
                  </label>
                  <TextField
                    label="Display override (optional)"
                    wide
                    value={editor.dimensionDisplayOverride}
                    onChange={(v: string) => set('dimensionDisplayOverride', v)}
                  />
                  <Area
                    label="Care instructions override"
                    value={editor.careInstructions}
                    onChange={(v: string) => set('careInstructions', v)}
                    placeholder={
                      defaults.productDefaultCareInstructions ||
                      'Uses global default when blank'
                    }
                  />
                  <Area
                    label="Delivery notes override"
                    value={editor.deliveryNotes}
                    onChange={(v: string) => set('deliveryNotes', v)}
                    placeholder={
                      defaults.productDefaultDeliveryNotes ||
                      'Uses global default when blank'
                    }
                  />
                  <fieldset className="related-picker wide">
                    <legend>Related products</legend>
                    <p>
                      Choose real catalogue relationships; none are added
                      automatically when you save.
                    </p>
                    <div>
                      {(data.products || [])
                        .filter((product) => product.id !== editor.id)
                        .map((product) => (
                          <label key={product.id}>
                            <input
                              type="checkbox"
                              checked={editor.relatedProductIds.includes(
                                product.id,
                              )}
                              onChange={(event) =>
                                set(
                                  'relatedProductIds',
                                  event.target.checked
                                    ? [...editor.relatedProductIds, product.id]
                                    : editor.relatedProductIds.filter(
                                        (id: string) => id !== product.id,
                                      ),
                                )
                              }
                            />
                            {product.name}
                          </label>
                        ))}
                    </div>
                  </fieldset>
                </div>
              )}
              {tab === 'Production' && (
                <div className="field-grid admin-only-section">
                  <p className="wide admin-only-label">
                    Admin only — never shown on the storefront
                  </p>
                  <TextField
                    label="Estimated print time (minutes)"
                    type="number"
                    min="0"
                    value={editor.estimatedPrintMinutes}
                    onChange={(v: number) => set('estimatedPrintMinutes', v)}
                  />
                  <TextField
                    label="Filament (grams)"
                    type="number"
                    min="0"
                    step="0.1"
                    value={editor.filamentGrams}
                    onChange={(v: number) => set('filamentGrams', v)}
                  />
                  <label>
                    Support difficulty
                    <select
                      value={editor.supportDifficulty}
                      onChange={(e) => set('supportDifficulty', e.target.value)}
                    >
                      <option value="">Not set</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="difficult">Difficult</option>
                    </select>
                  </label>
                  <TextField
                    label="Internal cost per unit (₹, optional)"
                    type="number"
                    min="0"
                    value={editor.internalUnitCost}
                    onChange={(v: number) => set('internalUnitCost', v)}
                  />
                  <label>
                    Commercial licence
                    <select
                      value={editor.commercialLicenseStatus}
                      onChange={(e) =>
                        set('commercialLicenseStatus', e.target.value)
                      }
                    >
                      <option value="unchecked">Unchecked</option>
                      <option value="commercial_verified">
                        Commercial use verified
                      </option>
                      <option value="personal_only">Personal use only</option>
                      <option value="restricted">
                        Restricted / needs review
                      </option>
                    </select>
                  </label>
                  <Area
                    label="Preferred print profile / notes"
                    value={editor.printProfileNotes}
                    onChange={(v: string) => set('printProfileNotes', v)}
                  />
                  <Area
                    label="Internal production notes"
                    value={editor.internalProductionNotes}
                    onChange={(v: string) => set('internalProductionNotes', v)}
                  />
                </div>
              )}
              {tab === 'SEO' && (
                <div className="field-grid">
                  <TextField
                    label="SEO title"
                    wide
                    maxLength={70}
                    value={editor.seoTitle}
                    onChange={(v: string) => set('seoTitle', v)}
                  />
                  <Area
                    label="SEO description"
                    value={editor.seoDescription}
                    onChange={(v: string) => set('seoDescription', v)}
                  />
                </div>
              )}
              {tab === 'Publishing' && (
                <div className="field-grid">
                  <label>
                    Availability
                    <select
                      value={editor.availability}
                      onChange={(e) => set('availability', e.target.value)}
                    >
                      <option value="available">Available</option>
                      <option value="temporarily_unavailable">
                        Temporarily unavailable
                      </option>
                      <option value="discontinued">Discontinued</option>
                    </select>
                  </label>
                  <label>
                    Stock mode
                    <select
                      value={editor.stockMode}
                      onChange={(e) => set('stockMode', e.target.value)}
                    >
                      <option value="made_to_order">Made to order</option>
                      <option value="quote_only">Quote only</option>
                      <option value="tracked">Tracked stock</option>
                    </select>
                  </label>
                  <TextField
                    label="Lead time override"
                    value={editor.leadTime}
                    onChange={(v: string) => set('leadTime', v)}
                    placeholder={
                      defaults.productDefaultLeadTime ||
                      'No global promise configured'
                    }
                  />
                  <TextField
                    label="Tags (comma separated)"
                    wide
                    value={editor.tags.join(', ')}
                    onChange={(v: string) => set('tags', v.split(','))}
                  />
                  <label className="toggle-row wide">
                    <span>
                      <b>Featured product</b>
                      <small>Eligible for the homepage featured section.</small>
                    </span>
                    <input
                      aria-label="Featured product"
                      type="checkbox"
                      checked={editor.featured}
                      onChange={(e) => set('featured', e.target.checked)}
                    />
                  </label>
                  <div className="publish-checklist wide">
                    <b>Publish checks</b>
                    <span className={editor.name ? 'ok' : ''}>
                      Product name
                    </span>
                    <span className={editor.categoryId ? 'ok' : ''}>
                      Controlled category
                    </span>
                    <span
                      className={
                        editor.images.length || editor.legacyImages.length
                          ? 'ok'
                          : ''
                      }
                    >
                      Main image
                    </span>
                    <span
                      className={
                        editor.commercialLicenseStatus === 'commercial_verified'
                          ? 'ok'
                          : ''
                      }
                    >
                      Commercial use verified
                    </span>
                    <span
                      className={
                        editor.stockMode === 'quote_only' ||
                        editor.basePrice > 0 ||
                        editor.variants.some(
                          (v: Variant) => v.enabled && v.sellingPrice != null,
                        )
                          ? 'ok'
                          : ''
                      }
                    >
                      Valid selling price
                    </span>
                  </div>
                </div>
              )}
              {tab === 'Advanced JSON' && (
                <section className="product-json-editor">
                  <div className="admin-warning">
                    <b>Advanced tool</b>
                    <p>
                      Normal editing is safer for everyday changes. JSON uses
                      the same server validation, licence checks, pricing rules
                      and publishing protections.
                    </p>
                    <p>
                      You may paste only the fields you want to change. Missing
                      fields keep their saved values; validation restores the
                      complete canonical product document.
                    </p>
                  </div>
                  {!editor.id ? (
                    <p>
                      Save this product as a draft before using the JSON editor.
                    </p>
                  ) : (
                    <>
                      <label>
                        Editable product JSON
                        <textarea
                          aria-label="Editable product JSON"
                          spellCheck={false}
                          value={jsonText}
                          onChange={(event) => {
                            setJsonText(event.target.value);
                            setJsonPreview(null);
                            setJsonWarnings([]);
                          }}
                        />
                      </label>
                      <div className="json-utility-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(jsonText);
                              setNotice('Copied');
                            } catch {
                              setError(
                                'Copy was blocked. Select the JSON and use your keyboard copy shortcut.',
                              );
                            }
                          }}
                        >
                          Copy JSON
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              setJsonText(text);
                              setJsonPreview(null);
                              setJsonWarnings([]);
                              setNotice(
                                'Pasted JSON. Validate it before saving.',
                              );
                            } catch {
                              setError(
                                'Paste was blocked. Click in the editor and use your keyboard paste shortcut.',
                              );
                            }
                          }}
                        >
                          Paste / Replace JSON
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            try {
                              setJsonText(
                                JSON.stringify(JSON.parse(jsonText), null, 2),
                              );
                              setJsonPreview(null);
                              setJsonWarnings([]);
                              setNotice('JSON formatted.');
                            } catch {
                              setError(
                                'JSON syntax is invalid, so it cannot be formatted.',
                              );
                            }
                          }}
                        >
                          Format JSON
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            setJsonText(savedJsonText);
                            setJsonPreview(null);
                            setJsonWarnings([]);
                            setNotice('Reset to the currently saved product.');
                          }}
                        >
                          Reset to saved
                        </button>
                      </div>
                      <div className="json-actions">
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() => submitJson('preview')}
                        >
                          Validate & preview changes
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          disabled={busy || !jsonPreview}
                          onClick={() => {
                            if (
                              confirm(
                                'Save these validated JSON changes to this product?',
                              )
                            )
                              void submitJson('save');
                          }}
                        >
                          Save JSON changes
                        </button>
                      </div>
                      {jsonPreview && (
                        <div className="json-diff">
                          <b>Validated change summary</b>
                          <p>
                            {jsonPreview.changedFields.length
                              ? jsonPreview.changedFields.join(', ')
                              : 'No field changes detected.'}
                          </p>
                          <span>
                            Publishing: {jsonPreview.publishingStatus} ·
                            Variants: {jsonPreview.variants} · Base price:{' '}
                            {formatMoney(jsonPreview.basePrice)}
                          </span>
                        </div>
                      )}
                      {!!jsonWarnings.length && (
                        <div className="admin-warning" role="status">
                          <b>Normalized with warnings</b>
                          <ul>
                            {jsonWarnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}
            </div>
            <footer>
              {error && <p className="form-error">{error}</p>}
              {notice && <p className="form-success">{notice}</p>}
              {editor.commercialLicenseStatus !== 'commercial_verified' && (
                <p className="admin-hint">
                  Publishing requires a verified commercial licence. Review it
                  in the Production tab; you can still save a draft.
                </p>
              )}
              <div>
                <button
                  className={`button ${editor.publishingStatus === 'published' ? 'secondary' : 'primary'}`}
                  disabled={busy}
                  onClick={() => {
                    if (
                      editor.publishingStatus === 'published' &&
                      !window.confirm(
                        'Save as draft and hide this product from the store? Existing orders will stay unchanged.',
                      )
                    )
                      return;
                    save('draft');
                  }}
                >
                  {busy
                    ? 'Saving…'
                    : editor.publishingStatus === 'published'
                      ? 'Unpublish & save draft'
                      : 'Save Draft'}
                </button>
                <button
                  className="button secondary"
                  onClick={() => setPreviewing(true)}
                >
                  Preview
                </button>
                <button
                  className={`button ${editor.publishingStatus === 'published' ? 'primary' : 'secondary'}`}
                  disabled={
                    busy ||
                    editor.commercialLicenseStatus !== 'commercial_verified'
                  }
                  onClick={() => save('published')}
                >
                  <CheckCircle2 />{' '}
                  {editor.publishingStatus === 'published'
                    ? 'Save published changes'
                    : 'Publish'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {showImport && (
        <ImportDialog
          format={importFormat}
          setFormat={setImportFormat}
          content={importContent}
          setContent={setImportContent}
          preview={importPreview}
          busy={busy}
          close={() => setShowImport(false)}
          run={runImport}
        />
      )}
      {previewing && editor && (
        <div className="product-editor-backdrop preview-backdrop">
          <section className="admin-product-preview" role="dialog">
            <button
              className="icon-button"
              onClick={() => setPreviewing(false)}
              aria-label="Close preview"
            >
              <X />
            </button>
            {editor.images[0]?.url || editor.legacyImages[0] ? (
              <img
                src={editor.images[0]?.url || editor.legacyImages[0]}
                alt="Product preview"
              />
            ) : (
              <div className="preview-image-empty">
                <ImagePlus /> No main image yet
              </div>
            )}
            <p className="eyebrow">
              {categories.find((item) => item.id === editor.categoryId)?.name ||
                'Category pending'}
            </p>
            <h2>{editor.name || 'Untitled product'}</h2>
            <p>{editor.shortDescription || 'Short description pending.'}</p>
            <strong>{formatMoney(editor.basePrice || 0)}</strong>
            <small>
              Draft preview only · storefront visibility is unchanged
            </small>
          </section>
        </div>
      )}
    </>
  );
}

function Pricing({ editor, set, finishes }: any) {
  function update(index: number, key: string, value: any) {
    const variants = [...editor.variants];
    variants[index] = { ...variants[index], [key]: value };
    if (key === 'finishId') {
      const finish = finishes.find((f: any) => f.id === value);
      variants[index].name = finish?.name || variants[index].name;
    }
    set('variants', variants);
  }
  return (
    <div>
      <div className="field-grid">
        <TextField
          label="Base selling price"
          type="number"
          min="0"
          value={editor.basePrice}
          onChange={(v: number) => set('basePrice', v)}
        />
        <label>
          Product type
          <select
            value={editor.productType || 'normal'}
            onChange={(e) => {
              set('productType', e.target.value);
              set(
                'stockMode',
                e.target.value === 'customizable'
                  ? 'quote_only'
                  : 'made_to_order',
              );
            }}
          >
            <option value="normal">Normal — COD or UPI</option>
            <option value="customizable">
              Customizable — approved quote, prepaid UPI
            </option>
          </select>
        </label>
        <TextField
          label="Original price (optional)"
          type="number"
          min="0"
          value={editor.compareAtPrice}
          onChange={(v: number) => set('compareAtPrice', v)}
        />
      </div>
      <div className="variant-head">
        <div>
          <h3>Finishes / variants</h3>
          <p>
            Select reusable finishes, then set the exact price for this product.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() =>
            set('variants', [
              ...editor.variants,
              {
                name: '',
                finishId: '',
                sellingPrice: editor.basePrice || undefined,
                originalPrice: undefined,
                priceAdjustment: 0,
                enabled: true,
                availability: 'available',
                exactImageIds: [],
                sortOrder: editor.variants.length,
              },
            ])
          }
        >
          <Plus /> Add finish
        </button>
      </div>
      <div className="variant-list">
        {editor.variants.map((v: Variant, i: number) => (
          <div className="variant-row" key={v.id || i}>
            <span className="drag-index">{i + 1}</span>
            <label>
              Global finish
              <select
                value={v.finishId || ''}
                onChange={(e) => update(i, 'finishId', e.target.value)}
              >
                <option value="">Custom finish</option>
                {finishes
                  .filter((f: any) => f.active)
                  .map((f: any) => (
                    <option value={f.id} key={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </label>
            <TextField
              label="Finish name"
              value={v.name}
              onChange={(x: string) => update(i, 'name', x)}
            />
            <TextField
              label="Selling price"
              type="number"
              min="0"
              value={v.sellingPrice}
              onChange={(x: number) => update(i, 'sellingPrice', x)}
            />
            <TextField
              label="Original price"
              type="number"
              min="0"
              value={v.originalPrice}
              onChange={(x: number) => update(i, 'originalPrice', x)}
            />
            <label>
              Availability
              <select
                value={v.availability}
                onChange={(e) => update(i, 'availability', e.target.value)}
              >
                <option value="available">Available</option>
                <option value="temporarily_unavailable">Unavailable</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </label>
            <fieldset className="variant-image-picker">
              <legend>Actual product photos for this finish</legend>
              {editor.images.length ? (
                <div>
                  {editor.images.map((image: ImageRow, imageIndex: number) => (
                    <label key={image.id}>
                      <input
                        type="checkbox"
                        checked={(v.exactImageIds || []).includes(image.id)}
                        onChange={(event) =>
                          update(
                            i,
                            'exactImageIds',
                            event.target.checked
                              ? [...(v.exactImageIds || []), image.id]
                              : (v.exactImageIds || []).filter(
                                  (id: string) => id !== image.id,
                                ),
                          )
                        }
                      />
                      <img src={image.url} alt="" />
                      <span>Photo {imageIndex + 1}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <small>
                  Upload product photos first. The default gallery remains
                  visible until finish-specific photos are assigned.
                </small>
              )}
            </fieldset>
            <label className="mini-toggle">
              Enabled
              <input
                type="checkbox"
                checked={v.enabled}
                onChange={(e) => update(i, 'enabled', e.target.checked)}
              />
            </label>
            <button
              className="icon-button danger"
              aria-label="Remove finish"
              onClick={() =>
                set(
                  'variants',
                  editor.variants.filter((_: Variant, n: number) => n !== i),
                )
              }
            >
              <Trash2 />
            </button>
          </div>
        ))}
        {!editor.variants.length && (
          <div className="admin-empty">
            No finishes added. The base price will be used.
          </div>
        )}
      </div>
    </div>
  );
}
function Images({ editor, upload, action }: any) {
  return (
    <div>
      <div className="image-upload-row">
        <label className="image-drop">
          <ImagePlus />
          <b>Upload main image</b>
          <span>JPG, PNG or WebP · up to 8 MB</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => upload(e, 'main')}
          />
        </label>
        <label className="image-drop">
          <Plus />
          <b>Add gallery image</b>
          <span>Up to 12 images per product</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => upload(e, 'gallery')}
          />
        </label>
      </div>
      {!editor.id && (
        <p className="admin-hint">
          Save the product as a draft first, then upload images.
        </p>
      )}
      <div className="product-image-grid">
        {editor.images.map((image: ImageRow) => (
          <article key={image.id}>
            <img src={image.url} alt={image.alt_text || ''} />
            <span>{image.role === 'main' ? 'Main image' : 'Gallery'}</span>
            <div>
              {image.role !== 'main' && (
                <button onClick={() => action(image.id, 'main')}>
                  Set main
                </button>
              )}
              <button
                aria-label="Move up"
                onClick={() => action(image.id, 'up', image.sort_order)}
              >
                <ChevronUp />
              </button>
              <button
                aria-label="Move down"
                onClick={() => action(image.id, 'down', image.sort_order)}
              >
                <ChevronDown />
              </button>
              <button
                aria-label="Delete image"
                onClick={() => action(image.id, 'delete')}
              >
                <Trash2 />
              </button>
            </div>
          </article>
        ))}
        {editor.legacyImages.map((src: string) => (
          <article key={src}>
            <img src={src} alt="Legacy product visual" />
            <span>Existing image</span>
            <small>Kept for compatibility; upload to R2 when replacing.</small>
          </article>
        ))}
      </div>
    </div>
  );
}
function Managers({ categories, finishes, reload, upload }: any) {
  const [category, setCategory] = useState(''),
    [finish, setFinish] = useState(''),
    [swatch, setSwatch] = useState('#222222'),
    [error, setError] = useState('');
  async function add(path: string, body: any) {
    const r = await fetch(`/api/admin/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      d = (await r.json()) as any;
    if (!r.ok) setError(d.error);
    else {
      setCategory('');
      setFinish('');
      reload();
    }
  }
  return (
    <section className="catalog-managers">
      <div>
        <h3>Controlled categories</h3>
        <p>One source of truth for Admin and storefront browsing.</p>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add('categories', { name: category });
          }}
        >
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="New category name"
            required
          />
          <button className="button secondary">Add</button>
        </form>
        <div className="manager-chips">
          {categories.map((c: any) => (
            <span key={c.id}>
              {c.name}
              <small>{c.product_count || 0}</small>
            </span>
          ))}
        </div>
      </div>
      <div>
        <h3>Global finishes</h3>
        <p>Reusable real finish references. No finish data is invented.</p>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            add('finishes', { name: finish, swatch, active: true });
          }}
        >
          <input
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
            placeholder="Finish name"
            required
          />
          <input
            type="color"
            value={swatch}
            onChange={(e) => setSwatch(e.target.value)}
          />
          <button className="button secondary">Add</button>
        </form>
        <div className="finish-manager-list">
          {finishes.map((f: any) => (
            <span key={f.id}>
              <i style={{ background: f.swatch || '#ddd' }} />
              {f.name}
              {f.reference_image ? (
                <img src={f.reference_image} alt="" />
              ) : (
                <label>
                  Upload reference
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => upload(e, 'gallery', f.id)}
                  />
                </label>
              )}
            </span>
          ))}
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
function ImportDialog({
  format,
  setFormat,
  content,
  setContent,
  preview,
  busy,
  close,
  run,
}: any) {
  return (
    <div className="product-editor-backdrop">
      <section className="import-dialog">
        <header>
          <div>
            <p className="eyebrow">Safe batch workflow</p>
            <h2>Bulk import products</h2>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </header>
        <p>
          Paste CSV or JSON, validate every row, then commit the complete batch.
          Imports are always created as drafts.
        </p>
        <label>
          Format
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value);
              setContent('');
            }}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="wide">
          Product data
          <textarea
            className="import-source"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              format === 'csv'
                ? 'name,category,sku,slug,short_description,description,selling_price,...'
                : '[{ "name": "", "category": "", "variants": [] }]'
            }
          />
        </label>
        {preview && (
          <div
            className={`import-results ${preview.valid ? 'valid' : 'invalid'}`}
          >
            <b>
              {preview.valid
                ? 'Ready to import'
                : `${preview.errorCount || 0} validation errors`}
            </b>
            <div>
              {preview.rows?.map((row: any) => (
                <article key={row.row}>
                  <span>
                    Row {row.row}: {row.name || 'Unnamed'}
                  </span>
                  {row.errors?.length ? (
                    <ul>
                      {row.errors.map((e: string) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <small>{row.sku} · Draft</small>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
        <footer>
          <button
            className="button secondary"
            disabled={busy || !content}
            onClick={() => run('dry-run')}
          >
            {busy ? 'Validating…' : 'Validate & Preview'}
          </button>
          <button
            className="button primary"
            disabled={busy || !preview?.valid}
            onClick={() => run('commit')}
          >
            Import valid batch
          </button>
        </footer>
      </section>
    </div>
  );
}
