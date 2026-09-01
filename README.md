# MorrowMade ecommerce V1

A production-oriented, mobile-first ecommerce system for personalized and custom-made 3D printed consumer products. Orders are saved in the relational database before customers are handed to WhatsApp for UPI/COD confirmation.

## Stack and architecture

- Vinext / React 19 / TypeScript with server rendering and Cloudflare Worker-compatible output
- Cloudflare D1 (SQLite) through Drizzle schema and checked-in migrations
- Cloudflare R2 for private custom-request uploads
- Zod validation at server boundaries
- A small client store for instant cart UX, paired with server-authoritative checkout pricing and durable database records
- Environment-backed signed admin sessions
- Provider-based AI layer with a safe no-key fallback
- Vitest for pricing, phone, status, AI fallback and WhatsApp handoff tests

Business rules live under `lib/services`, persistence schema under `db/schema.ts`, route handlers under `app/api`, storefront pages under `app`, and admin UI under `app/admin`.

## Local setup

Requirements: Node.js 22.13 or newer and npm.

1. Copy `.env.example` to `.env.local`.
2. Set `ADMIN_EMAIL`, a strong `ADMIN_PASSWORD`, and a random `ADMIN_SESSION_SECRET` of at least 32 characters.
3. Run `npm install`.
4. Run `npm run db:migrate:local`.
5. Run `npm run db:seed:local`.
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
- `OPENAI_API_KEY=...`
- `AI_MODEL=gpt-5-mini` (or another Responses-compatible model)

Add the AI key only in the deployment environment or `.env.local`; never in browser code or source control. Without it the normal shop, cart, checkout, orders, uploads and admin remain available, and chat shows the configured fallback.

Optional analytics/future payment:

- `META_PIXEL_ID`
- `NEXT_PUBLIC_GA_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`

The V1 event abstraction stores first-party funnel events. External analytics IDs are reserved for a consent-aware integration. No `Purchase` event is fired by WhatsApp handoff. Razorpay variables are reserved; V1 does not call a payment gateway.

## Catalog, prices and options

The canonical relational records are `products`, `product_options`, `product_option_values`, and `product_variants`. The seed data in `db/seed.sql` provides Krishna Idol, Custom Name Plate, Personalized Gift, and Custom 3D Print. `lib/catalog.ts` is the resilient development/build fallback.

Change day-to-day base prices, visibility, featured state, and lead time in **Admin → Products**. Product pages and checkout read the database; checkout always recalculates pricing server-side. For new option structures, update the relational records (or `db/seed.sql` for a fresh environment). A future richer option editor can sit on the existing schema without changing order storage.

## Product images

Product records accept a JSON array of image URLs/storage paths in the `images` column. Until at least one image exists, all customer surfaces use the reusable `ProductImage` placeholder.

For a simple deployment, add optimized files under `public/products/<product-slug>/` and set the product `images` value to paths such as:

```json
["/products/krishna-idol/hero.webp", "/products/krishna-idol/detail.webp"]
```

For larger production catalogs, upload images to managed object storage/CDN and save those URLs instead. Use WebP/AVIF, meaningful alt text in product copy, and consistent 4:5 primary crops.

## UPI QR

V1 intentionally confirms UPI/COD manually on WhatsApp. The settings model reserves `upiQrKey` for a private R2 object. When adding the QR, upload it to the `FILES` bucket at `business/upi-qr.png`, save that key as the `upiQrKey` setting, and only serve it through an authenticated/time-limited route or intentionally customer-visible confirmation flow. Do not commit a live payment QR to source control.

## WhatsApp handoff

`lib/services/whatsapp.ts` is the single WhatsApp service. It normalizes the configured number, creates the complete order/context message, URL-encodes it, and produces the official `https://wa.me/<number>?text=...` link. Checkout writes customer, address, order, items, customizations, timeline and analytics records in D1 first. The unique `Idempotency-Key` prevents double-click duplicates.

## AI architecture

`AIProvider` defines `generate`, optional `stream`, and `healthCheck`. The OpenAI-compatible provider uses the Responses API from the server. Conversations and messages are transport-independent and channel-aware (`web`, later `whatsapp`/`admin`). Pricing, cart and order authority stay outside the model. The system prompt explicitly prohibits invented prices, availability, promises and payment changes.

The next AI expansion point is a trusted tool registry for `getProducts`, `getProduct`, `getPrice`, `updateCart`, `getCart`, `setProductOption`, `startCheckout`, `getOrderStatus`, and `createCustomQuote`.

## Security notes

- All checkout pricing and option values are validated/recalculated server-side.
- Checkout idempotency, Indian phone validation, status-transition validation and structured validation are enforced.
- Admin credentials and signing keys are environment-only; the session cookie is HttpOnly, SameSite Strict and Secure in production.
- AI, checkout, quote and admin-login endpoints have request throttling. For multi-region production, replace the in-memory limiter with a durable edge rate-limiter/Turnstile.
- Upload extensions, MIME metadata, count and 15 MB/file limits are checked; names are sanitized and R2 objects are private by default.
- Public order lookup returns only non-sensitive status, items and totals—not address/contact details.
- Admin endpoints independently verify the signed session.

## Deployment

The project contains `.openai/hosting.json` with D1 (`DB`) and R2 (`FILES`) logical bindings and produces Cloudflare Worker-compatible ESM. For production:

1. Create/attach the real D1 and R2 resources through the hosting control plane.
2. Apply the checked-in Drizzle migration, then seed or enter real catalog data.
3. Add all required environment secrets to the hosting environment.
4. Replace sample prices/copy and add real branding/product images.
5. Set the real `SITE_URL` and configure the domain/HTTPS.
6. Add durable distributed rate limiting and a transactional email/notification provider if needed.
7. Review Privacy/Terms with your legal advisor and run real-device checkout/WhatsApp acceptance tests.
8. Configure backups, monitoring, log retention and an admin credential rotation process.

Payment gateway integration can be added behind the existing order/payment status model without rewriting order creation.
