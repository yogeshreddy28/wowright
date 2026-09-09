import { readdir, readFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
const root = resolve(fileURLToPath(new URL('..', import.meta.url))),
  source = resolve(root, 'products');
const slugify = (value) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
function category(name, custom) {
  if (/krishna|ganesha|ganpati|buddha/i.test(name)) return 'Devotional';
  if (custom) return 'Personalized Gifts';
  if (/halloween|ghost|christmas/i.test(name)) return 'Seasonal';
  if (/phone|cable|pencil|toothpaste|organizer/i.test(name))
    return 'Desk & Utility';
  if (
    /fidget|squishy|spinn|propeller|glider|kit card|kunai|karambit/i.test(name)
  )
    return 'Toys & Fidgets';
  return 'Home Decor';
}
const plan = [];
for (const entry of (await readdir(source, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const folder = entry.name.trim(),
    number = folder.match(/^\d+/)?.[0],
    withoutIndex = folder.replace(/^\d+\s*-\s*/, ''),
    match = withoutIndex.match(/(?:\s*rs\s*|\s+)(\d+)\s*$/i);
  const price = match ? Number(match[1]) : null,
    name = match ? withoutIndex.slice(0, match.index).trim() : withoutIndex;
  const slug = slugify(name),
    files = (await readdir(resolve(source, entry.name)))
      .filter((f) => /\.(webp|jpe?g|png|jfif)$/i.test(f))
      .sort();
  plan.push({
    sourceFolder: entry.name,
    name,
    slug,
    category: category(name, price === null),
    price,
    productType: price === null ? 'customizable' : 'normal',
    files: files.map((filename, index) => ({
      source: resolve(source, entry.name, filename),
      publicPath: `/catalog-products/${number}-${slug}/${index + 1}${extname(filename).toLowerCase() === '.jfif' ? '.jpg' : extname(filename).toLowerCase()}`,
    })),
  });
}
if (!process.argv.includes('--commit') && !process.argv.includes('--audit')) {
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        count: plan.length,
        purchasable: plan.filter((p) => p.price !== null).length,
        customizable: plan.filter((p) => p.price === null).length,
        products: plan.map(({ files, ...p }) => ({
          ...p,
          imageCount: files.length,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
// Credentials are loaded only in this local script and never printed or persisted.
const local = parseEnv(await readFile(resolve(root, '.env.local'), 'utf8')),
  origin = 'http://localhost:3000';
if (!local.ADMIN_EMAIL || !local.ADMIN_PASSWORD)
  throw new Error('Local admin credentials are not configured.');
const login = await fetch(origin + '/api/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: local.ADMIN_EMAIL,
    password: local.ADMIN_PASSWORD,
  }),
});
if (!login.ok) throw new Error('Local admin sign-in failed.');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Local admin session is unavailable.');
async function get(path) {
  const response = await fetch(origin + path, { headers: { cookie } });
  if (!response.ok)
    throw new Error('Could not inspect the existing catalogue.');
  return response.json();
}
const existing = await get('/api/admin/products'),
  categories = await get('/api/admin/categories');
if (process.argv.includes('--audit')) {
  const imported = existing.products.filter((p) =>
    plan.some((source) => source.sourceFolder === p.source_folder),
  );
  const errors = [];
  for (const source of plan) {
    const row = imported.find((p) => p.source_folder === source.sourceFolder);
    if (!row) {
      errors.push({ name: source.name, issue: 'Missing draft' });
      continue;
    }
    if (
      row.name !== source.name ||
      row.base_price !== (source.price ?? 0) ||
      row.publishing_status !== 'draft' ||
      row.commercial_license_status !== 'unchecked' ||
      row.product_type !== source.productType ||
      JSON.stringify(row.images) !==
        JSON.stringify(source.files.map((f) => f.publicPath))
    )
      errors.push({
        name: source.name,
        issue: 'Draft differs from approved import',
      });
  }
  const safeStatuses = {};
  const imagePaths = [
    ...new Set(
      plan.flatMap((product) => product.files.map((file) => file.publicPath)),
    ),
  ];
  let imagesChecked = 0;
  // Check every imported asset without downloading image bodies or changing records.
  for (let index = 0; index < imagePaths.length; index += 4) {
    await Promise.all(
      imagePaths.slice(index, index + 4).map(async (path) => {
        const response = await fetch(origin + path, { method: 'HEAD' });
        imagesChecked++;
        if (
          !response.ok ||
          !response.headers.get('content-type')?.startsWith('image/')
        )
          errors.push({
            issue: 'Imported image is not being served correctly',
            path,
            status: response.status,
          });
      }),
    );
  }
  for (const path of [
    'overview',
    'production',
    'delivery',
    'quotes',
    'reports',
    'reviews',
  ]) {
    const response = await fetch(origin + '/api/admin/' + path, {
      headers: { cookie },
    });
    safeStatuses[path] = response.status;
    if (!response.ok)
      errors.push({
        issue: 'Admin API check failed',
        path,
        status: response.status,
      });
  }
  const ai = await get('/api/admin/settings/ai');
  if (ai.encryptionConfigured !== true)
    errors.push({
      issue: 'Secure AI storage is not configured in the running server',
    });
  console.log(
    JSON.stringify(
      {
        mode: 'read-only audit',
        sourceFolders: plan.length,
        importedDrafts: imported.length,
        pricedDrafts: imported.filter((p) => p.product_type === 'normal')
          .length,
        customQuoteDrafts: imported.filter(
          (p) => p.product_type === 'customizable',
        ).length,
        errors,
        importedImagesChecked: imagesChecked,
        adminApiStatuses: safeStatuses,
        aiEncryptionConfigured: ai.encryptionConfigured === true,
      },
      null,
      2,
    ),
  );
  process.exit(errors.length ? 1 : 0);
}
let imported = 0,
  skipped = 0;
for (const product of plan) {
  if (
    existing.products.some(
      (p) =>
        p.source_folder === product.sourceFolder || p.slug === product.slug,
    )
  ) {
    skipped++;
    continue;
  }
  const cat = categories.categories.find((c) => c.name === product.category);
  if (!cat)
    throw new Error('Required category is unavailable: ' + product.category);
  for (const file of product.files) {
    const destination = resolve(root, 'public', '.' + file.publicPath);
    await mkdir(resolve(destination, '..'), { recursive: true });
    await copyFile(file.source, destination);
  }
  const response = await fetch(origin + '/api/admin/products', {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: product.name,
      slug: product.slug,
      slugManual: true,
      categoryId: cat.id,
      basePrice: product.price ?? 0,
      productType: product.productType,
      stockMode: product.price === null ? 'quote_only' : 'made_to_order',
      sourceFolder: product.sourceFolder,
      images: product.files.map((f) => f.publicPath),
      publishingStatus: 'draft',
      commercialLicenseStatus: 'unchecked',
      description: '',
      shortDescription: '',
      material: '',
      leadTime: '',
    }),
  });
  if (!response.ok) {
    const body = await response.json();
    console.error(
      JSON.stringify({
        product: product.name,
        error: body.error || 'Import failed',
        imported,
        skipped,
      }),
    );
    process.exit(1);
  }
  imported++;
}
console.log(
  JSON.stringify({
    imported,
    skipped,
    total: plan.length,
    status:
      'Drafts only. No licence verification, prices, dimensions or descriptions invented.',
  }),
);
