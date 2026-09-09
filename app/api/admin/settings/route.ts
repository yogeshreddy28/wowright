import { env } from 'cloudflare:workers';
import { verifyAdmin } from '@/lib/admin-auth';
const defaults = {
  businessName: 'WOW RIGHT',
  whatsappNumber: '919353193080',
  deliveryCharge: 49,
  freeDeliveryThreshold: 999,
  businessCity: 'Bangalore',
  aiEnabled: false,
  customOrdersEnabled: true,
  codEnabled: true,
  upiEnabled: true,
  upiQrKey: null,
  companionEnabled: true,
  companionProactiveEnabled: true,
  companionExperimentVariant: 'control',
  companionPromptCooldown: 50,
  productDefaultMaterial: 'PLA',
  productDefaultStockMode: 'made_to_order',
  productDefaultLeadTime: '',
  productMadeToOrderNotice: 'Made to order for you.',
  productDefaultDeliveryNotes: '',
  productDefaultCareInstructions: '',
  productDefaultOpenBoxInfo: '',
  adminOrderSoundEnabled: false,
};
export async function GET(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await env.DB.prepare('SELECT key,value FROM settings').all<{
    key: string;
    value: string;
  }>();
  const saved = Object.fromEntries(
    rows.results.map((x) => [x.key, JSON.parse(x.value)]),
  );
  return Response.json({ settings: { ...defaults, ...saved,deliveryCharge:49,freeDeliveryThreshold:999 } });
}
export async function PUT(r: Request) {
  if (!(await verifyAdmin(r)))
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const d = (await r.json()) as Record<string, unknown>;
  const allowed = Object.keys(defaults);
  const batch = Object.entries(d)
    .filter(([k]) => allowed.includes(k)&&!['deliveryCharge','freeDeliveryThreshold'].includes(k))
    .map(([k, v]) =>
      env.DB.prepare(
        'INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
      ).bind(k, JSON.stringify(v), new Date().toISOString()),
    );
  if (batch.length) await env.DB.batch(batch);
  return Response.json({ ok: true });
}
