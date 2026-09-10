'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Boxes,
  Factory,
  DatabaseBackup,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  PackageCheck,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Wifi,
  Palette,
} from 'lucide-react';
import { formatMoney } from '@/lib/services/pricing';
import { AdminProducts } from '@/components/admin-products';
import { AdminFinishes } from '@/components/admin-finishes';
import { ProductionAdmin, DeliveryAdmin } from './operations-admin';
import { QuotesAdmin } from './quotes-view';
import { ReportsAdmin } from './reports-admin';
import { ReviewsAdmin } from './reviews-admin';
import { AdminOverview } from './admin-overview';
import { AdminOrders } from './admin-orders';
import { EmptyWork } from './workflow-ui';
import {
  OrderSoundButton,
  useAdminOrderNotifications,
} from './admin-order-notifier';
type View =
  | 'overview'
  | 'orders'
  | 'products'
  | 'finishes'
  | 'customers'
  | 'conversations'
  | 'production'
  | 'delivery'
  | 'quotes'
  | 'reports'
  | 'reviews'
  | 'settings';
const links: [View, string, typeof LayoutDashboard][] = [
  ['overview', 'Overview', LayoutDashboard],
  ['orders', 'Orders', ShoppingBag],
  ['production', 'Production', Factory],
  ['delivery', 'Delivery', PackageCheck],
  ['quotes', 'Custom requests', MessageSquare],
  ['reports', 'Profit & analytics', BarChart3],
  ['reviews', 'Verified reviews', MessageSquare],
  ['products', 'Products', Boxes],
  ['finishes', 'Finishes & Colours', Palette],
  ['customers', 'Customers', Users],
  ['conversations', 'Conversations', MessageSquare],
  ['settings', 'Settings', Settings],
];
export function AdminLogin({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    setError('');
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const d = (await r.json()) as { error?: string };
      if (r.ok) onDone();
      else setError(d.error || 'Sign in failed');
    } catch {
      setError('Could not connect. Please try signing in again.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="admin-login">
      <form onSubmit={submit}>
        <Link className="brand" href="/">
          <span>WOW</span>
          <b>RIGHT</b>
        </Link>
        <p className="eyebrow">Protected WOW RIGHT workspace</p>
        <h1>Admin sign in</h1>
        <label>
          Email
          <input type="email" name="email" required />
        </label>
        <label>
          Password
          <input type="password" name="password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="button primary full" disabled={loading}>
          {loading ? 'Checking…' : 'Sign in'}
        </button>
        <small>
          Credentials are configured securely through environment variables.
        </small>
      </form>
    </div>
  );
}
export function AdminShell({
  view,
  children,
}: {
  view: View;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const notifications = useAdminOrderNotifications(view);
  return (
    <div className="admin-layout admin-workspace">
      <aside>
        <Link className="brand inverted" href="/">
          <span>WOW</span>
          <b>RIGHT</b>
        </Link>
        <nav>
          {links.map(([id, label, Icon]) => (
            <Link
              className={view === id ? 'active' : ''}
              href={id === 'overview' ? '/admin' : `/admin/${id}`}
              key={id}
            >
              <Icon />
              {label}
              {id === 'orders' && notifications.unseen > 0 && (
                <span
                  className="admin-nav-badge"
                  aria-label={`${notifications.unseen} unseen orders`}
                >
                  {notifications.unseen > 99 ? '99+' : notifications.unseen}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <Link href="/">
          <LogOut /> View storefront
        </Link>
      </aside>
      <main>
        <div className="ux-workspace-bar">
          <span>
            WOW RIGHT <b>/ {links.find(([id]) => id === view)?.[1]}</b>
          </span>
          <Link href="/">View store ↗</Link>
          <OrderSoundButton
            enabled={notifications.soundEnabled}
            unlocked={notifications.audioUnlocked}
            unseen={notifications.unseen}
            message={notifications.audioMessage}
            onEnable={notifications.enableSound}
            onMute={notifications.muteSound}
            onTest={notifications.testSound}
          />
          {view === 'orders' && notifications.unseen > 0 && (
            <button
              type="button"
              className="admin-acknowledge-orders"
              onClick={notifications.acknowledgeAll}
            >
              Acknowledge {notifications.unseen} new{' '}
              {notifications.unseen === 1 ? 'order' : 'orders'}
            </button>
          )}
          <select
            aria-label="Go to workspace"
            value={view}
            onChange={(e) =>
              router.push(
                e.target.value === 'overview'
                  ? '/admin'
                  : '/admin/' + e.target.value,
              )
            }
          >
            {links.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {children}
      </main>
    </div>
  );
}
function AdminHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="admin-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
export function LegacyProducts({
  data,
  reload,
}: {
  data: any;
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string>('');
  async function change(p: any, field: string, value: unknown) {
    await fetch('/api/admin/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, [field]: value }),
    });
    reload();
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    setCreating(false);
    reload();
  }
  return (
    <>
      <AdminHead
        eyebrow="Catalog"
        title="Products"
        action={
          <button
            className="button primary"
            onClick={() => setCreating(!creating)}
          >
            Create product
          </button>
        }
      />
      {creating && (
        <form className="admin-create-product" onSubmit={create}>
          <div className="field-grid">
            <label>
              Name
              <input name="name" required />
            </label>
            <label>
              Slug
              <input name="slug" required pattern="[a-z0-9-]+" />
            </label>
            <label>
              Category
              <input name="category" required />
            </label>
            <label>
              SKU
              <input name="sku" />
            </label>
            <label>
              Base price
              <input name="basePrice" type="number" min="0" required />
            </label>
            <label className="wide">
              Short description
              <input name="shortDescription" required />
            </label>
            <label className="wide">
              Description
              <textarea name="description" required />
            </label>
            <label>
              Lead time
              <input
                name="leadTime"
                placeholder="Set an honest production estimate"
              />
            </label>
            <label>
              Publishing status
              <select name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="unavailable">Unavailable</option>
              </select>
            </label>
            <label>
              Dimensions
              <input name="dimensions" />
            </label>
            <label>
              Material
              <input name="material" />
            </label>
            <label className="wide">
              Delivery notes
              <textarea name="deliveryNotes" />
            </label>
            <label className="wide">
              Care instructions
              <textarea name="careInstructions" />
            </label>
            <label>
              Commercial licence status <small>admin only</small>
              <input name="commercialLicenseStatus" />
            </label>
            <label>
              Stock mode
              <select name="stockMode">
                <option value="made_to_order">Made to order</option>
                <option value="quote_only">Quote only</option>
                <option value="tracked">Tracked stock</option>
              </select>
            </label>
          </div>
          <button className="button primary">Save product</button>
        </form>
      )}
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Base price</th>
              <th>Lead time</th>
              <th>Featured</th>
              <th>Active</th>
              <th>Setup</th>
            </tr>
          </thead>
          <tbody>
            {data.products?.map((p: any) => (
              <tr key={p.id}>
                <td>
                  <div className="admin-product-cell">
                    {p.images?.[0] && <img src={p.images[0]} alt="" />}
                    <div>
                      <input
                        className="table-input wide"
                        defaultValue={p.name}
                        onBlur={(e) => change(p, 'name', e.target.value)}
                      />
                      <small>/{p.slug}</small>
                    </div>
                  </div>
                </td>
                <td>{p.category}</td>
                <td>
                  <input
                    aria-label={`${p.name} base price`}
                    className="table-input"
                    type="number"
                    defaultValue={p.base_price}
                    onBlur={(e) =>
                      change(p, 'basePrice', Number(e.target.value))
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`${p.name} lead time`}
                    className="table-input wide"
                    defaultValue={p.lead_time}
                    onBlur={(e) => change(p, 'leadTime', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`${p.name} featured`}
                    type="checkbox"
                    defaultChecked={Boolean(p.featured)}
                    onChange={(e) => change(p, 'featured', e.target.checked)}
                  />
                </td>
                <td>
                  <input
                    aria-label={`${p.name} active`}
                    type="checkbox"
                    defaultChecked={Boolean(p.active)}
                    onChange={(e) => change(p, 'active', e.target.checked)}
                  />
                </td>
                <td>
                  <button
                    className="setup-button"
                    onClick={() => setSelected(selected === p.id ? '' : p.id)}
                  >
                    Images & options
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <ProductConfiguration
          productId={selected}
          onSaved={() => {
            setSelected('');
            reload();
          }}
        />
      )}
    </>
  );
}
function ProductConfiguration({
  productId,
  onSaved,
}: {
  productId: string;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/admin/products/${productId}/configuration`)
      .then(async (r) => await r.json())
      .then((d) => setConfig(JSON.stringify(d, null, 2)))
      .catch(() => setError('Could not load product setup.'));
  }, [productId]);
  async function save() {
    try {
      const parsed = JSON.parse(config);
      const r = await fetch(`/api/admin/products/${productId}/configuration`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check the JSON format.');
    }
  }
  return (
    <section className="product-config-editor">
      <h2>Product details, images, finishes & options</h2>
      <p>
        Temporary demo image paths can be replaced with final photography.
        Option types: select, radio, text, textarea, number or boolean. Price
        adjustments are in rupees. Finish reference images must be real sample
        references and are labelled as references on the storefront.
      </p>
      {config ? (
        <textarea
          aria-label="Product images, options and variants JSON"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
      ) : (
        <p>Loading setup…</p>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="button primary" onClick={save}>
        Save product setup
      </button>
    </section>
  );
}
function Customers({ data }: { data: any }) {
  const [search, setSearch] = useState('');
  const customers = (data.customers || []).filter((c: any) =>
    [c.name, c.mobile, c.email]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <AdminHead eyebrow="People behind your orders" title="Customers" />
      <p>Find a customer, then open their orders to help with the next step.</p>
      <label className="ux-search">
        <Search size={18} />
        <input
          aria-label="Search customers"
          placeholder="Name, phone or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Email</th>
              <th>Email status</th>
              <th>Login</th>
              <th>Orders</th>
              <th>Total spent</th>
              <th>Last order</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c: any) => (
              <tr key={c.id}>
                <td>
                  <Link
                    href={'/admin/orders?q=' + encodeURIComponent(c.mobile)}
                  >
                    <b>{c.name}</b>
                  </Link>
                </td>
                <td>{c.mobile}</td>
                <td>{c.email || '—'}</td>
                <td>
                  {c.email
                    ? c.email_verified_at
                      ? 'Verified'
                      : 'Not verified'
                    : 'Legacy · missing email'}
                </td>
                <td>
                  {String(c.auth_method || 'legacy')
                    .split(',')
                    .map((method: string) =>
                      method === 'google'
                        ? 'Google'
                        : method === 'email'
                          ? 'Email'
                          : 'Legacy',
                    )
                    .join(' + ')}
                </td>
                <td>{c.order_count}</td>
                <td>{formatMoney(c.total_spent)}</td>
                <td>
                  {c.last_order_at
                    ? new Date(c.last_order_at).toLocaleDateString('en-IN')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!customers.length && (
          <EmptyWork
            title={
              search
                ? 'No matching customers'
                : 'Your customers will appear here'
            }
            description={
              search
                ? 'Try another name or phone number.'
                : 'Customer details are saved when an order is placed.'
            }
          />
        )}
      </div>
    </>
  );
}
function Conversations({ data }: { data: any }) {
  const [selected, setSelected] = useState(''),
    [messages, setMessages] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function open(id: string) {
    setSelected(id);
    setBusy(true);
    setError('');
    setMessages([]);
    try {
      const r = await fetch(
        '/api/admin/conversations?id=' + encodeURIComponent(id),
        { cache: 'no-store' },
      );
      if (!r.ok) throw Error();
      const body = (await r.json()) as { messages: any[] };
      setMessages(body.messages);
    } catch {
      setError('Could not load this conversation. Try opening it again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AdminHead eyebrow="Customer support" title="Conversations" />
      <p>
        Recent messages from WOW Assistant. Order conversations are also
        available inside each order.
      </p>
      <div className="conversation-list">
        {data.conversations?.map((c: any) => (
          <article key={c.id}>
            <div>
              <span className="status-badge">{c.channel}</span>
              <b>{c.message_count} messages</b>
              <small>{new Date(c.updated_at).toLocaleString('en-IN')}</small>
            </div>
            <p>{c.last_message}</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => (selected === c.id ? setSelected('') : open(c.id))}
            >
              {selected === c.id ? 'Close conversation' : 'Read conversation'}
            </button>
            {selected === c.id && (
              <section
                className="ux-conversation-thread"
                aria-label="Conversation messages"
              >
                {busy ? (
                  <p>Loading messages…</p>
                ) : error ? (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                ) : (
                  messages.map((m) => (
                    <div className={'ux-message ' + m.role} key={m.id}>
                      <strong>
                        {m.role === 'assistant'
                          ? 'WOW Assistant'
                          : m.role === 'customer'
                            ? 'Customer'
                            : m.role === 'human'
                              ? 'Team member'
                              : 'System'}
                      </strong>
                      <p>{m.message}</p>
                      <small>
                        {new Date(m.created_at).toLocaleString('en-IN')}
                      </small>
                    </div>
                  ))
                )}
              </section>
            )}
          </article>
        ))}
        {!data.conversations?.length && (
          <EmptyWork
            title="No conversations to review"
            description="Saved assistant messages will appear here when a customer asks for help."
          />
        )}
      </div>
    </>
  );
}
type PublicAISettings = {
  provider: string;
  model: string;
  apiKeyConfigured: boolean;
  encryptionConfigured: boolean;
  connectionStatus:
    | 'connected'
    | 'configured_not_tested'
    | 'not_configured'
    | 'connection_error';
  lastTestedAt: string | null;
};
const connectionLabels: Record<string, string> = {
  connected: 'Connected',
  configured_not_tested: 'Configured but not tested',
  not_configured: 'Not configured',
  connection_error: 'Connection error',
  invalid_api_key: 'Invalid API key',
  model_unavailable: 'Model unavailable',
  rate_limited: 'Rate limited',
  network_error: 'Network error',
};
function AISettingsCard() {
  const formRef = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<PublicAISettings | null>(null);
  const [status, setStatus] = useState('not_configured');
  const [busy, setBusy] = useState<'saving' | 'testing' | 'removing' | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/settings/ai', {
      cache: 'no-store',
    });
    if (!response.ok) return setError('AI settings could not be loaded.');
    const value = (await response.json()) as PublicAISettings;
    setSettings(value);
    setStatus(value.connectionStatus);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  function formValues() {
    if (!formRef.current) return null;
    const data = new FormData(formRef.current);
    return {
      provider: String(data.get('provider')),
      model: String(data.get('model')).trim(),
      apiKey: String(data.get('apiKey')).trim() || undefined,
    };
  }
  function clearKeyInput() {
    const field = formRef.current?.elements.namedItem('apiKey');
    if (field instanceof HTMLInputElement) field.value = '';
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = formValues();
    if (!body) return;
    setBusy('saving');
    setError('');
    setNotice('');
    const response = await fetch('/api/admin/settings/ai', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { error?: string };
    if (response.ok) {
      clearKeyInput();
      setNotice('AI settings saved.');
      await load();
    } else setError(result.error || 'AI settings could not be saved.');
    setBusy(null);
  }
  async function testConnection() {
    const body = formValues();
    if (!body) return;
    setBusy('testing');
    setError('');
    setNotice('');
    const response = await fetch('/api/admin/settings/ai/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { status?: string };
    setStatus(result.status || 'connection_error');
    if (result.status === 'connected') setNotice('Connection successful.');
    else
      setError(
        connectionLabels[result.status || ''] || 'Connection test failed.',
      );
    setBusy(null);
  }
  async function removeKey() {
    if (!window.confirm('Remove the securely stored Admin API key?')) return;
    setBusy('removing');
    setError('');
    setNotice('');
    const response = await fetch('/api/admin/settings/ai/key', {
      method: 'DELETE',
    });
    clearKeyInput();
    if (response.ok) {
      setNotice('Admin API key removed.');
      await load();
    } else setError('AI key could not be removed.');
    setBusy(null);
  }
  if (!settings)
    return (
      <section className="admin-settings ai-settings-card">
        Loading AI settings…
      </section>
    );
  return (
    <form
      ref={formRef}
      className="admin-settings ai-settings-card"
      onSubmit={save}
    >
      <div className="ai-settings-title">
        <span>
          <Sparkles />
        </span>
        <div>
          <p className="eyebrow">Settings · AI Assistant</p>
          <h2>AI Assistant</h2>
          <p>
            Configure the AI model used by WOW Assistant and the WOW Companion.
          </p>
        </div>
      </div>
      <div className="field-grid">
        <label>
          Provider
          <select name="provider" defaultValue={settings.provider}>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          Model
          <input
            name="model"
            defaultValue={settings.model}
            required
            maxLength={100}
          />
        </label>
      </div>
      <label className="ai-key-field">
        API Key
        <div>
          <KeyRound />
          <input
            name="apiKey"
            type="password"
            autoComplete="new-password"
            disabled={!settings.encryptionConfigured}
            placeholder={
              settings.apiKeyConfigured
                ? '••••••••••••••••••••••••'
                : 'Enter OpenAI API key'
            }
          />
        </div>
      </label>
      {!settings.encryptionConfigured && (
        <p className="ai-storage-warning">
          Secure key storage is not configured on this server. Ask the server
          administrator to configure encrypted AI settings before entering an
          API key.
        </p>
      )}
      <div className="ai-key-meta">
        <span>
          {settings.apiKeyConfigured
            ? '✓ API key configured'
            : 'No API key configured'}
        </span>
        {settings.apiKeyConfigured && (
          <button
            type="button"
            className="text-button danger"
            onClick={removeKey}
            disabled={Boolean(busy)}
          >
            Remove key
          </button>
        )}
      </div>
      <div className={`ai-connection ${status}`}>
        <Wifi />
        <div>
          <small>WOW Assistant</small>
          <strong>
            <i /> {connectionLabels[status] || 'Connection error'}
          </strong>
          <span>Provider: OpenAI · Model: {settings.model}</span>
          {settings.lastTestedAt && (
            <time>
              Last tested:{' '}
              {new Date(settings.lastTestedAt).toLocaleString('en-IN')}
            </time>
          )}
        </div>
      </div>
      {notice && <p className="form-success">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="ai-settings-actions">
        <button
          type="button"
          className="button secondary"
          onClick={testConnection}
          disabled={Boolean(busy)}
        >
          {busy === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        <button className="button primary" disabled={Boolean(busy)}>
          {busy === 'saving' ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
      <p className="admin-hint">
        Leaving the key field blank keeps the existing key. Enter a new key to
        replace it.
      </p>
    </form>
  );
}

type DataResetPreview = {
  eligible: Record<string, number>;
  details: Record<string, number>;
  preserved: Record<string, number>;
  unclassified: Record<string, number>;
};
type ClassificationPreview = {
  token: string;
  primary: Record<string, number>;
  related: Record<string, number>;
};
const dataResetOptions = [
  [
    'orders',
    'Orders',
    'Test orders and their order items, timelines and access records',
  ],
  [
    'customers',
    'Customers',
    'Verified test customers with no preserved orders',
  ],
  [
    'production',
    'Production, QC & packing',
    'Test production allocations, checklists and packing progress',
  ],
  [
    'delivery',
    'Delivery runs & proof records',
    'Test batches, stops and delivery proof records',
  ],
  [
    'payments',
    'Payments & reconciliation',
    'Collections and direct costs belonging to test orders',
  ],
  ['reviews', 'Reviews', 'Reviews belonging to test order items'],
  [
    'quotes',
    'Custom requests & quotes',
    'Verified test quote requests and upload records',
  ],
  [
    'conversations',
    'Conversations',
    'Verified test WOW Assistant conversations and messages',
  ],
  [
    'analytics',
    'Store analytics',
    'Verified test funnel events, excluding Companion analytics',
  ],
  [
    'companion_analytics',
    'WOW Companion analytics',
    'Verified test Companion interaction events',
  ],
] as const;

function DataResetCard() {
  const [preview, setPreview] = useState<DataResetPreview | null>(null);
  const [classification, setClassification] =
    useState<ClassificationPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [classificationConfirmation, setClassificationConfirmation] =
    useState('');
  const [reviewingClassification, setReviewingClassification] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DataResetPreview | null>(null);
  const load = useCallback(async () => {
    const response = await fetch('/api/admin/settings/data-reset', {
      cache: 'no-store',
    });
    if (!response.ok) return setError('The reset preview could not be loaded.');
    const body = (await response.json()) as {
      preview: DataResetPreview;
      classification: ClassificationPreview;
    };
    setPreview(body.preview);
    setClassification(body.classification);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const allSelected = selected.length === dataResetOptions.length;
  const selectedCount = selected.reduce(
    (total, key) => total + Number(preview?.eligible[key] || 0),
    0,
  );
  function toggle(key: string) {
    setResult(null);
    setReviewing(false);
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  function prepareLaunch() {
    setSelected(dataResetOptions.map(([key]) => key));
    setResult(null);
    setReviewing(true);
    setConfirmation('');
    document
      .getElementById('data-reset-confirmation')
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  async function runReset() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/settings/data-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopes: selected,
          confirmed: true,
          confirmationText: confirmation,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        result?: { before: DataResetPreview; after: DataResetPreview };
      };
      if (!response.ok || !body.result)
        throw new Error(body.error || 'Reset failed.');
      setResult(body.result.before);
      setPreview(body.result.after);
      setSelected([]);
      setReviewing(false);
      setConfirmation('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reset failed safely.');
    } finally {
      setBusy(false);
    }
  }
  async function classifyCurrentData() {
    if (!classification) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/settings/data-reset', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: classification.token,
          confirmationText: classificationConfirmation,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Classification failed.');
      setReviewingClassification(false);
      setClassificationConfirmation('');
      setNoticeForClassification(
        'Current operational data is now marked as test and ready for reset.',
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Classification failed safely.',
      );
      await load();
    } finally {
      setBusy(false);
    }
  }
  const [classificationNotice, setNoticeForClassification] = useState('');
  const unclassifiedTotal = classification
    ? Object.values(classification.primary).reduce(
        (sum, value) => sum + value,
        0,
      )
    : 0;
  return (
    <section
      className="admin-settings data-reset-card"
      id="data-reset-settings"
    >
      <div className="data-reset-heading">
        <span>
          <DatabaseBackup />
        </span>
        <div>
          <p className="eyebrow">Settings · Data & Reset</p>
          <h2>Data & Reset</h2>
          <p>
            Remove verified demo activity before launch without touching your
            catalogue or business setup.
          </p>
        </div>
      </div>
      <div className="data-reset-warning" role="note">
        <strong>
          This action permanently removes selected test/demo data.
        </strong>
        <span>
          Product catalogue, settings and configuration remain unchanged.
        </span>
      </div>
      {!preview ? (
        <p>Preparing a safe preview…</p>
      ) : (
        <>
          <div className="reset-preserved">
            <strong>Always preserved</strong>
            <span>
              {preview.preserved.products} products ·{' '}
              {preview.preserved.productImages} stored product images ·{' '}
              {preview.preserved.categories} categories
            </span>
            <span>
              Admin and delivery accounts · AI/API settings · WhatsApp and Meta
              configuration · business and production settings
            </span>
          </div>
          <div className="reset-option-list">
            {dataResetOptions.map(([key, label, description]) => (
              <label
                key={key}
                className={selected.includes(key) ? 'selected' : ''}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(key)}
                  onChange={() => toggle(key)}
                />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <b>{preview.eligible[key] || 0}</b>
              </label>
            ))}
          </div>
          <div className="reset-unclassified">
            <strong>Preserved because not marked as test</strong>
            <span>
              {preview.unclassified.orders} orders ·{' '}
              {preview.unclassified.customers} customers ·{' '}
              {preview.unclassified.conversations} conversations ·{' '}
              {preview.unclassified.analytics} analytics events ·{' '}
              {preview.unclassified.deliveryRuns} delivery runs
            </span>
            <button
              className="button secondary classify-button"
              type="button"
              disabled={!unclassifiedTotal}
              onClick={() => {
                setReviewingClassification(true);
                setClassificationConfirmation('');
                setNoticeForClassification('');
              }}
            >
              Mark Current Operational Data as Test
            </button>
          </div>
          {reviewingClassification && classification && (
            <div className="reset-confirmation classification-confirmation">
              <p className="eyebrow">Classification review</p>
              <h3>Mark Current Operational Data as Test</h3>
              <p>
                This does not delete anything. It classifies only the exact
                operational snapshot shown below so it can be removed by a later
                reset.
              </p>
              <div className="classification-columns">
                <div>
                  <strong>Records to classify</strong>
                  <ul>
                    {Object.entries(classification.primary)
                      .filter(([, count]) => count > 0)
                      .map(([key, count]) => (
                        <li key={key}>
                          {count} {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <strong>Related records covered by those markers</strong>
                  <ul>
                    {Object.entries(classification.related)
                      .filter(([, count]) => count > 0)
                      .map(([key, count]) => (
                        <li key={key}>
                          {count} {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
              <p>
                <strong>Never classified:</strong> products, images, prices,
                categories, variants/options, accounts, credentials, AI/API
                settings, WhatsApp/Meta settings or business/production
                configuration.
              </p>
              <label>
                Type <strong>MARK AS TEST</strong> to confirm
                <input
                  value={classificationConfirmation}
                  onChange={(event) =>
                    setClassificationConfirmation(event.target.value)
                  }
                  autoComplete="off"
                />
              </label>
              <div className="data-reset-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setReviewingClassification(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button danger-button"
                  onClick={classifyCurrentData}
                  disabled={
                    busy || classificationConfirmation !== 'MARK AS TEST'
                  }
                >
                  {busy ? 'Classifying…' : 'Mark snapshot as test'}
                </button>
              </div>
            </div>
          )}
          <div className="data-reset-actions">
            <button
              className="button secondary"
              type="button"
              disabled={!selected.length}
              onClick={() => setReviewing(true)}
            >
              Review selected reset
            </button>
            <button
              className="button danger-button"
              type="button"
              onClick={prepareLaunch}
            >
              Prepare for Clean Launch
            </button>
          </div>
        </>
      )}
      {reviewing && preview && (
        <div className="reset-confirmation" id="data-reset-confirmation">
          <p className="eyebrow">Final review</p>
          <h3>
            {allSelected
              ? 'Prepare for Clean Launch'
              : 'Reset selected test data'}
          </h3>
          <p>
            <strong>{selectedCount} primary records</strong> are eligible across
            the selected sections. Related test-only child records are removed
            with their parent.
          </p>
          <ul>
            {dataResetOptions
              .filter(([key]) => selected.includes(key))
              .map(([key, label]) => (
                <li key={key}>
                  {preview.eligible[key] || 0} {label.toLowerCase()}
                </li>
              ))}
          </ul>
          <p>
            Your {preview.preserved.products} products, product assets,
            categories, accounts and all configuration remain preserved.
          </p>
          {allSelected && (
            <label>
              Type <strong>RESET TEST DATA</strong> to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <label className="reset-check">
            <input
              type="checkbox"
              checked={
                confirmation === 'confirmed' ||
                (allSelected && confirmation === 'RESET TEST DATA')
              }
              onChange={(event) => {
                if (!allSelected)
                  setConfirmation(event.target.checked ? 'confirmed' : '');
              }}
              disabled={allSelected}
            />{' '}
            I reviewed what will be removed and preserved.
          </label>
          <div className="data-reset-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setReviewing(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button danger-button"
              onClick={runReset}
              disabled={
                busy ||
                (allSelected
                  ? confirmation !== 'RESET TEST DATA'
                  : confirmation !== 'confirmed')
              }
            >
              {busy
                ? 'Removing test data…'
                : allSelected
                  ? 'Prepare for Clean Launch'
                  : 'Permanently reset selected data'}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="reset-success" role="status">
          <strong>Clean-up complete.</strong>
          <span>
            Removed:{' '}
            {Object.entries(result.eligible)
              .filter(([, count]) => count > 0)
              .map(([key, count]) => `${count} ${key.replaceAll('_', ' ')}`)
              .join(' · ') || 'No eligible records'}
            .
          </span>
          <span>Catalogue and configuration checks passed in the preview.</span>
        </div>
      )}
      {classificationNotice && (
        <div className="reset-success" role="status">
          <strong>Classification complete.</strong>
          <span>{classificationNotice}</span>
          <span>
            Review the resettable counts, then use Prepare for Clean Launch when
            you are ready.
          </span>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
function SettingsView({ data, reload }: { data: any; reload: () => void }) {
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      businessName: fd.get('businessName'),
      whatsappNumber: fd.get('whatsappNumber'),
      deliveryCharge: Number(fd.get('deliveryCharge')),
      freeDeliveryThreshold: Number(fd.get('freeDeliveryThreshold')) || null,
      businessCity: fd.get('businessCity'),
      aiEnabled: fd.get('aiEnabled') === 'on',
      customOrdersEnabled: fd.get('customOrdersEnabled') === 'on',
      codEnabled: fd.get('codEnabled') === 'on',
      upiEnabled: fd.get('upiEnabled') === 'on',
      companionEnabled: fd.get('companionEnabled') === 'on',
      companionProactiveEnabled: fd.get('companionProactiveEnabled') === 'on',
      companionExperimentVariant: fd.get('companionExperimentVariant'),
      companionPromptCooldown: Number(fd.get('companionPromptCooldown')) || 50,
      productDefaultMaterial: fd.get('productDefaultMaterial'),
      productDefaultStockMode: fd.get('productDefaultStockMode'),
      productDefaultLeadTime: fd.get('productDefaultLeadTime'),
      productMadeToOrderNotice: fd.get('productMadeToOrderNotice'),
      productDefaultDeliveryNotes: fd.get('productDefaultDeliveryNotes'),
      productDefaultCareInstructions: fd.get('productDefaultCareInstructions'),
      productDefaultOpenBoxInfo: fd.get('productDefaultOpenBoxInfo'),
    };
    setBusy(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          'Settings were not saved. Check your entries and try again.',
        );
      setSaved(true);
      reload();
    } catch {
      setError('Settings were not saved. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  const s = data.settings || {};
  return (
    <>
      <AdminHead
        eyebrow="Business configuration"
        title="Settings"
        action={saved ? <span className="saved-label">Saved</span> : null}
      />
      <nav className="ux-section-links" aria-label="Settings sections">
        <a href="#business-settings">Business & delivery</a>
        <a href="#product-defaults">Product defaults</a>
        <a href="#feature-settings">Payments & features</a>
        <a href="#ai-settings">AI Assistant</a>
        <a href="#data-reset-settings">Data & Reset</a>
      </nav>
      <p id="launch-delivery-rules">
        Launch rules: Bengaluru only · minimum order ₹499 · delivery ₹49 · free
        delivery from ₹999. These approved rules are locked for launch.
      </p>
      <form id="business-settings" className="admin-settings" onSubmit={submit}>
        <h2>Business & delivery</h2>
        <div className="field-grid">
          <label>
            Business name
            <input name="businessName" defaultValue={s.businessName} />
          </label>
          <label>
            WhatsApp number
            <input name="whatsappNumber" defaultValue={s.whatsappNumber} />
          </label>
          <label>
            Delivery charge
            <input
              name="deliveryCharge"
              type="number"
              value={49}
              readOnly
              aria-describedby="launch-delivery-rules"
            />
          </label>
          <label>
            Free delivery threshold
            <input
              name="freeDeliveryThreshold"
              type="number"
              value={999}
              readOnly
              aria-describedby="launch-delivery-rules"
            />
          </label>
          <label>
            Business city
            <input name="businessCity" defaultValue={s.businessCity} />
          </label>
          <label>
            Companion experiment variant
            <select
              name="companionExperimentVariant"
              defaultValue={s.companionExperimentVariant || 'control'}
            >
              <option value="control">Control</option>
              <option value="helpful">Helpful prompt</option>
              <option value="quiet">Quiet</option>
            </select>
          </label>
          <label>
            Companion prompt cooldown (seconds)
            <input
              name="companionPromptCooldown"
              type="number"
              min="30"
              max="300"
              defaultValue={s.companionPromptCooldown || 50}
            />
          </label>
        </div>
        <details
          id="product-defaults"
          className="product-default-settings ux-disclosure"
        >
          <summary>
            Product defaults{' '}
            <small>Shared material, care and delivery information</small>
          </summary>
          <div>
            <p className="eyebrow">Catalogue defaults</p>
            <h2>Product content defaults</h2>
            <p>
              Products inherit these values when their own override is blank.
              Keep delivery promises empty until the business rule is final.
            </p>
          </div>
          <div className="field-grid">
            <label>
              Default material
              <input
                name="productDefaultMaterial"
                defaultValue={s.productDefaultMaterial || 'PLA'}
              />
            </label>
            <label>
              Default stock mode
              <select
                name="productDefaultStockMode"
                defaultValue={s.productDefaultStockMode || 'made_to_order'}
              >
                <option value="made_to_order">Made to order</option>
                <option value="tracked">Tracked stock</option>
                <option value="quote_only">Quote only</option>
              </select>
            </label>
            <label className="wide">
              Default lead time
              <input
                name="productDefaultLeadTime"
                defaultValue={s.productDefaultLeadTime || ''}
                placeholder="Leave blank until configured"
              />
            </label>
            <label className="wide">
              Made-to-order notice
              <textarea
                name="productMadeToOrderNotice"
                defaultValue={
                  s.productMadeToOrderNotice || 'Made to order for you.'
                }
              />
            </label>
            <label className="wide">
              Delivery notes
              <textarea
                name="productDefaultDeliveryNotes"
                defaultValue={s.productDefaultDeliveryNotes || ''}
              />
            </label>
            <label className="wide">
              Care instructions
              <textarea
                name="productDefaultCareInstructions"
                defaultValue={s.productDefaultCareInstructions || ''}
              />
            </label>
            <label className="wide">
              Open-box information
              <textarea
                name="productDefaultOpenBoxInfo"
                defaultValue={s.productDefaultOpenBoxInfo || ''}
              />
            </label>
          </div>
        </details>
        <h2 id="feature-settings">Payments & features</h2>
        <div className="setting-toggles">
          {[
            ['aiEnabled', 'AI assistant enabled'],
            ['customOrdersEnabled', 'Custom orders enabled'],
            ['codEnabled', 'Cash on Delivery enabled'],
            ['upiEnabled', 'UPI enabled'],
            ['companionEnabled', 'WOW Companion enabled'],
            [
              'companionProactiveEnabled',
              'Proactive companion prompts enabled',
            ],
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                name={key}
                type="checkbox"
                defaultChecked={Boolean(s[key])}
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="form-success">
            Business settings saved.
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save business settings'}
        </button>
        <p className="admin-hint">
          Add the UPI QR through private storage when ready; the schema reserves
          a private object key for it.
        </p>
      </form>
      <section id="ai-settings">
        <AISettingsCard />
      </section>
      <DataResetCard />
    </>
  );
}
export function AdminApp({ view = 'overview' }: { view?: View }) {
  const [data, setData] = useState<any>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    const endpoint = view === 'overview' ? 'overview' : view;
    setLoadError('');
    try {
      const r = await fetch(
        `/api/admin/${endpoint}${view === 'reports' ? '?period=today' : ''}`,
      );
      if (r.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!r.ok) throw new Error();
      setData(await r.json());
    } catch {
      setLoadError(
        'This workspace could not be loaded. Your data has not been changed.',
      );
    }
  }, [view]);
  useEffect(() => {
    load();
  }, [load]);
  if (unauthorized)
    return (
      <AdminLogin
        onDone={() => {
          setUnauthorized(false);
          load();
        }}
      />
    );
  if (!data)
    return (
      <div className="admin-loading">
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button className="button primary" onClick={load}>
              Try again
            </button>
          </>
        ) : (
          'Loading secure workspace…'
        )}
      </div>
    );
  return (
    <AdminShell view={view}>
      {loadError && (
        <p role="alert" className="form-error">
          {loadError} <button onClick={load}>Retry</button>
        </p>
      )}
      {view === 'overview' ? (
        <AdminOverview data={data} />
      ) : view === 'orders' ? (
        <AdminOrders data={data} />
      ) : view === 'products' ? (
        <AdminProducts data={data} reload={load} />
      ) : view === 'finishes' ? (
        <AdminFinishes data={data} reload={load} />
      ) : view === 'production' ? (
        <ProductionAdmin data={data} reload={load} />
      ) : view === 'delivery' ? (
        <DeliveryAdmin data={data} reload={load} />
      ) : view === 'quotes' ? (
        <QuotesAdmin data={data} reload={load} />
      ) : view === 'reports' ? (
        <ReportsAdmin data={data} reload={load} />
      ) : view === 'reviews' ? (
        <ReviewsAdmin data={data} reload={load} />
      ) : view === 'customers' ? (
        <Customers data={data} />
      ) : view === 'conversations' ? (
        <Conversations data={data} />
      ) : (
        <SettingsView data={data} reload={load} />
      )}
    </AdminShell>
  );
}
