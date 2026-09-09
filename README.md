# WOW RIGHT ecommerce V1

A production-oriented, mobile-first ecommerce system for personalized and custom-made 3D printed consumer products. Cash on Delivery orders complete on-site. UPI orders are saved as payment-pending before an exact-order WhatsApp handoff.

## Stack and architecture

- Vinext / React 19 / TypeScript with server rendering and Cloudflare Worker-compatible output
- Cloudflare D1 (SQLite) through Drizzle schema and checked-in migrations
- Cloudflare R2 for private custom-request uploads
- Zod validation at server boundaries
- A small client store for instant cart UX, paired with server-authoritative checkout pricing and durable database records
- Environment-backed signed admin sessions
- PBKDF2-SHA256 customer passwords, opaque HttpOnly customer sessions, saved addresses and owner-only order access
- Provider-based AI layer with a safe no-key fallback and a deterministic WOW Companion conversion engine
- Vitest for pricing, phone, status, AI fallback and WhatsApp handoff tests

Business rules live under `lib/services`, persistence schema under `db/schema.ts`, route handlers under `app/api`, storefront pages under `app`, and admin UI under `app/admin`.

## Local setup

Requirements: Node.js 22.13 or newer and npm.

1. Copy `.env.example` to `.env.local`.
2. Set `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, and a random `ADMIN_SESSION_SECRET` of at least 32 characters.
3. Run `npm install`.
4. Run `npm run db:migrate:local`.
5. For an empty disposable demo only, optionally run `npm run db:seed:local`. Do not seed this existing catalogue or production.
6. Run `npm run dev` and open `http://localhost:3000`.

Admin is at `http://localhost:3000/admin`.

## Commands

- `npm run dev` — local development
- `npm run typecheck` — TypeScript validation
- `npm run lint` — code quality checks
- `npm test` — automated tests
- `npm run build` — production build
- `npm run db:generate` — generate a migration after schema changes
- `npm run db:migrate:local` — apply migrations to local D1
- `npm run db:seed:local` — load editable sample catalog/settings

## Environment variables

Required for production:

- `SITE_URL` — canonical HTTPS origin
- `WHATSAPP_BUSINESS_NUMBER=919353193080`
- `BUSINESS_NAME`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET` — at least 32 random characters

Optional AI:

- `AI_PROVIDER=openai`
- `OPENAI_API_KEY=...` (optional environment fallback)
- `AI_MODEL=gpt-5.6-luna` (or another Responses-compatible model)
- `AI_SETTINGS_ENCRYPTION_KEY` — stable base64 encoding of exactly 32 random bytes; required to save an API key through Admin

Generate the encryption master once with `openssl rand -base64 32` and store it as a Cloudflare Worker secret with `npx wrangler secret put AI_SETTINGS_ENCRYPTION_KEY --config wrangler.jsonc` (paste the generated value at Wrangler's prompt). Never regenerate it while encrypted keys exist, because those keys would become unreadable. Never add either secret to browser code or source control.

The app remains fully usable without an AI key. Once the encryption master is configured, use **Admin → Settings → AI Assistant** to save and test an OpenAI key. Resolution is Admin-encrypted key → `OPENAI_API_KEY` environment secret → deterministic fallback. Model resolution is Admin → `AI_MODEL` → `gpt-5.6-luna`. Admin changes take effect immediately without a restart.

Optional analytics/future payment:

- `META_PIXEL_ID`
- `META_CAPI_ACCESS_TOKEN` (server secret)
- `META_API_VERSION` (current version supported by your account)
- `META_TEST_EVENT_CODE` (Events Manager testing only)
- `NEXT_PUBLIC_GA_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

Delivery verification:

- `DELIVERY_OTP_SECRET` — a stable server-only random secret of at least 24 characters used to derive short-lived delivery codes without storing plaintext codes. Set it in Cloudflare with `npx wrangler secret put DELIVERY_OTP_SECRET --config wrangler.jsonc`. If it is temporarily absent, the server can use the existing `AI_SETTINGS_ENCRYPTION_KEY`; production should configure a separate delivery secret.

The customer sees an active code only while signed in to the account that owns the out-for-delivery order. Drivers see only an input and verification result. Codes expire after 10 minutes, are single-use, rate-limited and bound to the assigned stop, order and delivery person. Admin overrides require a reason and are written to the audit history.

First-party funnel events are stored in D1. With explicit customer consent and configured credentials, optional Meta browser/server events use matching event IDs. Purchases are created server-side with the payment transaction; WhatsApp never creates a Purchase. D1 retains failed deliveries for retry from subsequent requests or Admin → Profit & analytics. Configure a scheduled outbox drain before relying on unattended retries. GA and Razorpay variables remain reserved; neither integration is called by V1.

## Catalog, prices and options

The canonical relational records are `products`, `categories`, `product_options`, `product_option_values`, `product_variants`, `global_finishes`, `product_images`, `tags`, `product_tags`, and `related_products`. Legacy image/tag columns remain readable only so existing catalogue data continues to work. The storefront never substitutes sample products when D1 is empty or unavailable. `lib/catalog.ts` retains test fixtures and FAQ copy, not a live catalogue fallback.

Use **Admin → Products** for the sectioned editor, controlled categories, auto-generated slug/SKU, exact finish prices, product/global finish images, structured dimensions, admin-only production data, publishing validation, duplication and dry-run bulk import. Product pages and checkout read the database; checkout always recalculates pricing server-side. Import instructions and empty templates are in `docs/PRODUCT_IMPORT.md`, `docs/product-import-template.csv`, and `docs/product-import-template.json`.

## Product images

New product images are uploaded from **Admin → Products → Images** into the bound private R2 bucket and recorded as normalized `product_images` metadata—never base64. Published product images are served through `/api/product-images/[imageId]`; draft images require an authenticated Admin session. Main/gallery roles and ordering are editable. Global finishes use the same R2 path and are clearly labelled as finish references on the storefront whenever no exact product-finish image exists.

The existing visual preview uses original, locally generated temporary assets under `public/demo-products/`; that folder has its own replacement guide. They remain readable through the legacy compatibility path until each is replaced from Admin.

To apply the WOW RIGHT demo image paths and storefront copy to an existing local database, run:

```bash
npx wrangler d1 execute site-creator-d1 --local --config wrangler.jsonc --file=db/brand-polish.sql
```

## UPI QR

V1 confirms UPI manually on WhatsApp; COD customers stay on the website. The settings model reserves `upiQrKey` for a private R2 object. When adding the QR, upload it to the `FILES` bucket at `business/upi-qr.png`, save that key as the `upiQrKey` setting, and only serve it through an authenticated/time-limited route or intentionally customer-visible confirmation flow. Do not commit a live payment QR to source control.

## WhatsApp handoff

`lib/services/whatsapp.ts` is the single WhatsApp service. UPI checkout writes customer, address, order, items, customizations, timeline and analytics records in D1 first, then creates the official exact order-number/amount `wa.me` link. COD creates a confirmed COD order and stays on-site. The unique `Idempotency-Key` prevents double-click duplicates.

Before submission, `/api/checkout/preview` uses the same trusted cart validator as checkout to show current totals and a production-capacity-based delivery estimate. Unknown print-time data—including unscheduled existing backlog—shows an owner-review message instead of a date. The preview creates no order and reserves no capacity; UPI production is scheduled only after payment confirmation.

## AI architecture

`AIProvider` defines `generate`, optional `stream`, and `healthCheck`. The OpenAI-compatible provider uses the Responses API from the server. `getAIProviderConfig()` is the sole runtime resolver. Admin-configured API keys are encrypted server-side with AES-256-GCM before D1 persistence; Admin GET responses expose only configuration status. Conversations and messages are transport-independent and channel-aware (`web`, later `whatsapp`/`admin`). Pricing, cart and order authority stay outside the model. The system prompt explicitly prohibits invented prices, availability, promises and payment changes.

The WOW Companion is the visual and behavioral interface to the same conversation system—not a second chatbot. It maintains first-party visitor context, campaign attribution, deterministic intent scoring, cooldown/dismissal rules, objection classification and a mascot state machine. Catalog recommendations and pricing use trusted server tools; mutations such as add-to-cart require an explicit customer click, and canonical checkout remains the only order-creation path.

Trusted tool endpoints live under `app/api/ai/tools`, behavior rules under `lib/companion`, and the visual companion under `components/wow-companion`. Companion engagement and assisted checkout attribution are stored with the session/order, while detailed funnel events remain in `analytics_events`. Admin settings control enabled/proactive state, prompt cooldown and experiment variant. Admin overview shows real companion counts with zero states.

For local testing, append `?companionDebug=1` on localhost. The debug panel shows current state, last event, intent score/stage, page, cooldown and variant, and can simulate deterministic triggers. It is intentionally unavailable on non-local hosts.

## Security notes

- All checkout pricing and option values are validated/recalculated server-side.
- Checkout idempotency, Indian phone validation, status-transition validation and structured validation are enforced.
- Admin credentials and signing keys are environment-only; the session cookie is HttpOnly, SameSite Strict and Secure in production.
- Authentication, AI, checkout and quote endpoints use shared D1 abuse counters with hashed identifiers. Low-risk interaction events also have local throttles. Add WAF/Turnstile for stronger public-launch protection.
- Upload extensions, MIME metadata, count and 15 MB/file limits are checked; names are sanitized and R2 objects are private by default.
- Order lookup requires the owning customer session or an opaque HttpOnly guest-order token and returns no address, contact details or internal notes.
- Admin endpoints independently verify the signed session.

## Deployment

The project contains `.openai/hosting.json` with D1 (`DB`) and R2 (`FILES`) logical bindings and produces Cloudflare Worker-compatible ESM. For production:

1. Create/attach the real D1 and R2 resources through the hosting control plane.
2. Apply all checked-in Drizzle migrations, through `0014_brief_magma.sql`, in order, then enter real catalog data. Do not load demo seed data into production.
3. Add all required environment secrets to the hosting environment.
4. Replace sample prices/copy and add real branding/product images.
5. Set the real `SITE_URL` and configure the domain/HTTPS.
6. Configure WAF/abuse monitoring, scheduled outbox retries and a transactional notification provider if needed.
7. Review Privacy/Terms with your legal advisor and run real-device checkout/WhatsApp acceptance tests.
8. Configure backups, monitoring, log retention and an admin credential rotation process.

Payment gateway integration can be added behind the existing order/payment status model without rewriting order creation.

## Approved folder import and launch work

The approved 46 source folders were imported locally as Draft: 43 supplied-price products and three quote-only customizable products. No imported product was published. Source images live under `public/catalog-products/`; no images were downloaded or invented. Inspect them in Admin → Products. Review the inferred category grouping, verify commercial rights, and supply actual descriptions, dimensions, finishes, care information, print times and costs before publishing.

`node scripts/import-product-folders.mjs --audit` compares every imported draft with the supplied names, prices and image references, using the running local server. It performs no catalogue mutations. `--commit` skips matching source folders/slugs and never overwrites existing products.

Launch rules, owner workflow, verification results and remaining release gates are recorded in `docs/LAUNCH-READINESS.md`.
