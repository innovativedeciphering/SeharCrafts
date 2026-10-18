# Sehar Crafts

A responsive handmade decor storefront and separate owner studio, designed for GitHub Pages with Supabase for authentication, products, photos, and orders.

## What works now

- Public collection, category filters, product photo carousels, modal galleries with play/pause/previous/next, original/discount prices, offers, shopping bag, and checkout form.
- Distinct owner route: `#/owner`. When Supabase is configured, authenticated owners can upload product photos, edit products, hide products, publish testimonials, set a private alert email, publish social media links, change public payment instructions and delivery policy, and update order/payment statuses.
- Database-generated order numbers (`SC-2026-000001`), server-calculated product totals, private customer/order data, delivered count, and owner-approved testimonials.
- Shopping assistant for products, prices, delivery and payment. This is a rules-based guide, **not an AI language model**; it cannot look up private orders or take payments.
- Pakistan and international delivery addresses; PKR is the authoritative order currency. Owner can set PKR-per-USD for an optional approximate USD display. Shipping, customs, and payment costs require confirmation.
- Email notification worker for order placement, confirmation, dispatch, delivery, cancellation, and payment status changes; requires server configuration below. Browser notifications only run while the owner dashboard is open.

Without backend configuration, the app intentionally displays a labelled demo collection and disables checkout. The sample product descriptions and AI-generated collection images are illustrative, not actual inventory. Upload real product photos and prices before taking orders. No fake deliveries or testimonials are seeded.

## Local development

Requires Node.js 24 and npm.

```sh
cd /workspace/SeharCrafts
npm ci
npm test
npm run dev -- --port 5173
```

Create `.env` from `.env.example` only when the backend is ready. The public Supabase URL and anon/publishable key go in these Vite variables. Never put a service-role key, email key, owner password or any other credential in a `VITE_` variable. Restart Vite after changing `.env`.

```sh
npm run build
npm run preview -- --port 4173
```

Each cloud task already uses an isolated environment; use the existing checkout, without creating a worktree unless requested.

## Connect Supabase (one-time owner setup)

1. Create a Supabase project under your own account. Select a suitable region and store the database password securely.
2. Run `supabase/schema.sql` in its SQL editor **once on a new project**. It creates tables, validated ordering functions, private order policies, the photo bucket and a notification outbox. Do not rerun it on an existing populated database without a migration review.
3. In Authentication → Users, create the owner's user with email and a strong password. Disable public signup in Authentication settings; customers do not need accounts. Enable MFA for the owner account when available.
4. Copy the owner's UUID and run in the SQL editor, replacing the placeholder:
   ```sql
   insert into public.owners(user_id) values ('OWNER-USER-UUID');
   ```
   A login alone never grants owner permissions. Do not add customers to this table.
5. In project API settings, copy the project URL and public anon key. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` locally, and as GitHub Actions repository **variables** for deployment.
6. Sign into `#/owner`. Add your real products with photos, prices, categories and offers. In Payment & delivery, enter the owner notification email (private), optional public Instagram/Facebook/TikTok links, payment receiving details and delivery policy. Only enter information intended for public viewing; never enter payment PINs, passwords or card secrets.
7. If displaying USD estimates, set the current number of PKR per USD and update it regularly. Orders and emails always retain their PKR totals. Agree international delivery and any currency conversion costs directly before payment.
8. Use a separate browser session to place a test order. Verify the order number and correct total in the studio, then test each status and payment update. Verify anonymous sessions cannot read `orders` or upload images.

The backend schema has not been tested against your hosted Supabase project until these steps are completed. Policies and SQL are included for review. Anonymous checkout is a public RPC; before a real public launch add bot/rate protection (for example Turnstile verification through an Edge Function and restricting the direct RPC), abuse monitoring, and a privacy/returns policy. Never rely on client-side validation as abuse protection. Stock reservations, automatic shipping rates, returns processing and gateway reconciliation are future work.

## Alerts while the owner is logged out

Recommended starting option: **email**, using Supabase Edge Functions and Resend. These services may have free tiers subject to current limits; this project does not promise permanently free delivery. SMS and WhatsApp business notifications usually incur charges or require provider approval. Browser alerts do not work when the page is closed.

1. Create a Resend account, verify a sending domain you control, and create an API key. A verified domain is generally needed to email real customers; a testing sender may be restricted to your own address.
2. Install the Supabase CLI and authenticate it to your project. Deploy `supabase/functions/notify-orders`. Its `verify_jwt = false` configuration is intentional: the function independently checks a dedicated `x-notification-secret` before doing any work.
3. Set the function secrets securely in Supabase: `RESEND_API_KEY`, `FROM_EMAIL` (e.g. `Sehar Crafts <orders@your-domain>`), and `NOTIFICATION_SECRET` (a long random value generated securely). Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Never put these in GitHub Pages, frontend variables, chat, or committed files.
   The owner sets the destination notification email herself in the studio; the worker reads it securely for every batch, so changing it requires no redeployment. The email is protected by owner-only database policies.
4. In Supabase Cron, schedule a POST every minute to `https://YOUR-PROJECT.supabase.co/functions/v1/notify-orders`, with `x-notification-secret` from Supabase Vault. Use its secure scheduled HTTP request setup; do not commit the header value. Request body can be `{}`. The worker drains up to 30 queued events per run.
5. Place an order, check `notification_events`, run the scheduled request, and verify both owner and customer inboxes. Change order and payment statuses and verify the follow-up emails. Emails acknowledge recorded status; they do not automatically verify a bank payment.
6. Monitor failed jobs and `last_error`. Events stop automatic retry after 10 attempts. Correct configuration before resetting attempts in SQL. Provider idempotency keys reduce duplicate emails on short retries; Resend's idempotency window is limited, so delayed retries may duplicate messages. Queue rows are marked sent only after both sends succeed. Overlapping runs use the same idempotency keys, but a production system should add queue leasing before higher traffic.

No email is sent until you connect the provider and scheduler. If the email service is down, the order remains saved and the owner can see it in the studio. Avoid collecting more customer information than necessary, restrict owner access, and set a retention policy.

## Publish on GitHub Pages

The included `.github/workflows/pages.yml` builds and deploys pushes to `main`.

1. Push this project to `innovativedeciphering/SeharCrafts`, branch `main`.
2. Repository Settings → Pages → Build and deployment → select **GitHub Actions**. A private repository may need a paid GitHub plan for Pages; check repository eligibility.
3. Add the two Supabase public variables under Settings → Secrets and variables → Actions → Variables. Leave both unset only for a demo preview. If you add/change variables later, rerun the deployment workflow.
4. Open Actions → Deploy Sehar Crafts and verify both jobs complete. If Pages was enabled after the initial push, use Run workflow.
5. Expected routes **after a successful deployment**:
   - Public: `https://innovativedeciphering.github.io/SeharCrafts/`
   - Owner: `https://innovativedeciphering.github.io/SeharCrafts/#/owner`

The owner URL is a separate route, not a security secret; Supabase authentication and row-level security protect owner actions. GitHub Pages hosts the public files only. There is no customer database or secret storage inside GitHub Pages. The workflow uses `/SeharCrafts/` as Vite's base path; adjust it if you rename the repository or use a custom domain.

## Suggested launch roadmap

1. **Preview:** approve the look, replace sample inventory and add actual product photographs. Keep checkout disabled until backend setup is complete.
2. **Private pilot:** connect Supabase and email, enter delivery/payment rules, test real owner access and anonymous restrictions, run several test orders and check every notification.
3. **Public launch:** add bot protection, privacy/returns/contact pages, determine Pakistan and international shipping charges, verify Pages deployment and mobile checkout, and publish genuine testimonials with permission.
4. **Payments:** start with manually confirmed bank transfers or a suitable local method. Add a supported gateway only after checking merchant eligibility, fees, international support, and webhook verification. Never collect raw card data in this site.
5. **Growth:** add inventory, order tracking links with unguessable tokens, search, shipping integration and analytics. Add a genuine AI assistant later through a server endpoint with spending limits; never expose its API key or private orders to public chat.

## Validation

`npm test` checks discounted totals, quantities, stale products, HTML escaping and image URL protocols. `npm run build` creates the Pages bundle. Browser smoke testing in the cloud covered filters, gallery controls, cart quantities/totals/removal, the demo checkout guard, chat responses, owner setup gating, and mobile overflow. The isolated PostgreSQL 17 integration suite (`npm run test:db`, requires Docker) also passed server price validation, private order and notification-email policies, owner updates, upload policies, delivered count, and notification queue checks using minimal Supabase auth/storage interfaces. This is not a hosted Supabase test. `npm run test:browser` runs the saved browser smoke suite against the dev server; set `CHROMIUM_PATH` if Chromium is installed elsewhere, and optionally `BASE_URL` to test another origin/base path. Backend login, storage, live orders and real email must additionally pass the Supabase launch checks above; frontend checks do not establish backend readiness.

Generated sample images are included locally to avoid an external photo-host dependency. Google Fonts is optional: the site falls back to system sans-serif and Georgia if fonts cannot load.

## Bank, mobile wallet, and per-order QR payments

In Owner studio → Payment & delivery, the owner can configure bank name, account title, account number/IBAN, JazzCash title and mobile number, Easypaisa title and mobile number, an HTTPS merchant-issued payment link, and cash on delivery. Empty or incomplete methods stay hidden. These are public receiving details; never enter a wallet PIN, banking login, OTP, card security code, or provider secret. Verify all details using a small test transfer before launch.

Customers choose an enabled payment method at checkout. The server validates availability, records the preference, and creates an unguessable payment-page token for every order. The confirmation screen generates a downloadable QR locally in the browser—no third-party QR service receives order data. Scanning it opens that order’s payment instructions, receiving details and accepted alternatives. Emails link to the same page, and the owner can reopen it from the order dashboard. Treat the link as private. It exposes the order number, product subtotal, order/payment status and preferred method; it excludes customer names, addresses and contact details.

**The QR opens the payment instructions page.** It does not itself initiate an in-app bank/wallet transfer or contain a Raast/JazzCash/Easypaisa merchant payment payload. Direct scan-to-pay requires a provider-issued payload or gateway integration. A configured merchant link opens the actual provider page; verify the recipient and amount there. Payment is manually verified by the owner. A scan or link click never marks an order paid. Delivery is additional and must be confirmed before payment. Paid, refunded, delivered or cancelled orders stop showing further payment requests on the payment page.

For **new** databases, run the updated `supabase/schema.sql` once. If you already ran the previous schema, run **only** `supabase/payment-upgrade.sql` once instead, and redeploy the notification worker. Do not rerun the base schema on an existing database. Existing orders are marked as having no recorded payment preference. Their new payment tokens allow the owner to share payment pages.

The email worker defaults to this repository’s GitHub Pages address. If hosting elsewhere, set its non-secret `STORE_URL` to the full storefront URL including the path, such as `https://example.com/SeharCrafts/`, then test the email link.

QR unit tests decode the generated PNG to verify the exact order URL. A mocked-backend browser test additionally exercises payment selection, order confirmation, QR download, private-token routing and suppression of further payment requests after receipt. To run it separately from the normal demo dev server:

```sh
VITE_SUPABASE_URL=https://sehar-test.supabase.co VITE_SUPABASE_ANON_KEY=public-test-key npm run dev -- --port 5175
# In another terminal:
node scripts/payment-smoke.cjs
```

These are dummy test settings; the browser intercepts requests. They do not connect to a real customer database or validate live payment-provider processing.

## Private order tracking and customer cancellation

Customers can use **Track order** in the navigation and paste their private tracking/payment link or code. Confirmation/payment pages include **Track or cancel this order**, and the owner can copy the private tracking URL from each order. The updated email worker links directly to tracking. Tracking shows the owner-recorded status, payment status, product subtotal and a history of order/payment updates. It does not connect to live courier location services or expose customer contact details. Treat the link as private.

Customers can cancel orders in `placed` or `confirmed` status using their private token and the email used for checkout, with an optional reason and explicit confirmation checkbox. The database checks the current status under a row lock, blocks cancellation after dispatch or delivery, and queues one cancellation notification. Repeated requests do not create duplicate cancellation events. Cancellation preserves the payment status; received funds require a separate refund arranged and recorded by the owner. Dispatched orders should follow the store’s returns/contact process.

**Existing Supabase installations:** run `supabase/tracking-upgrade.sql` in a new SQL Editor query after the payment upgrade is installed. This adds a cancellation-reason field and the restricted tracking/cancellation RPCs while preserving orders. Do not rerun `schema.sql` on an existing installation. New databases use the updated base schema. Redeploy `notify-orders` to put tracking links directly into future emails; older payment links still provide a tracking button after the website deploys. Alerts remain dependent on the configured email provider and scheduler.

Tracking/cancellation database checks run as part of `npm run test:db`. The mocked payment browser suite also checks tracking navigation, email errors, cancellation, refund messaging, post-dispatch restrictions and mobile layout.
