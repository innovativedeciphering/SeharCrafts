# GitHub Pages and Gmail owner alerts

Public store: https://innovativedeciphering.github.io/SeharCrafts/
Owner studio: https://innovativedeciphering.github.io/SeharCrafts/#/owner

GitHub Pages Settings must have an empty Custom domain field and HTTPS enabled. The deployment builds for `/SeharCrafts/`. No custom DNS or domain registration is needed for the website.

## Gmail as the owner recipient

The owner enters her Gmail in **Owner studio → Payment & delivery → Owner notification email (private)** and saves. This is the receiving inbox and Reply-To address, not a sender identity. The address remains in owner-only Supabase settings, never in frontend configuration or tracked files.

While using Resend's test sender, the saved recipient must equal the email registered on the Resend account. Signing in with GitHub does not prove that this email matches the owner's Gmail: check the Resend account profile. Do not assume arbitrary Gmail recipients are permitted. Verified domain sending is needed for unrestricted customer recipients; using Gmail as the recipient does not remove that requirement.

## Supabase Edge Function settings

Use the already-created `RESEND_API_KEY` in Supabase's secret settings. Keep credentials out of GitHub frontend variables and chat.

```text
FROM_EMAIL=Sehar Crafts <onboarding@resend.dev>
STORE_URL=https://innovativedeciphering.github.io/SeharCrafts/
NOTIFICATION_MODE=owner_only
```

Keep the securely generated `NOTIFICATION_SECRET`. Deploy the latest `supabase/functions/notify-orders/index.ts` as `notify-orders`. The built-in JWT check is off in `supabase/config.toml`; the function requires its own `x-notification-secret` header.

The updated worker sends only to the owner whenever the sender is on `resend.dev`. This prevents unrelated customer addresses from making a test-mode notification fail. An explicit `NOTIFICATION_MODE=owner_only` also keeps that policy after switching to a verified sender. With a verified sender and no owner-only setting, the original owner-and-customer mode is available. Email API acceptance is not a delivery guarantee; verify Resend's delivery logs and the actual inbox.

## Scheduler and a safe first test

Create the existing minute-by-minute Supabase Cron job described in README, with the matching shared secret retrieved from Vault. No email is sent just by deploying the website.

Before starting the schedule, inspect `notification_events` in Supabase for pending historical events: the worker will drain those too. Clear stale test events only if you intend to discard them, or run against a new test order first. A successful function response reports `sent`, `failed`, and `notification_mode`. Queue events are acknowledged only after the selected recipients' send requests succeed.

1. Place one test order through the app.
2. Invoke the deployed worker using its secure test interface/header or the scheduler. Never put the secret in the website.
3. Check Resend's delivery log and the owner's Gmail (including spam).
4. Change the order's status and payment status; check the next alert. Customer cancellation also queues an alert.

If notifications are still undeployed, deploy the worker and configure Cron before expecting mail. Owner Gmail alerts are separate from Gmail's own SMTP sending service. The current integration does not send from or sign into the owner's Gmail account, and does not need her Gmail password.

## Customer confirmations without a verified domain

To send to customers as well as the owner using Sehar's Gmail, use the [Gmail API setup](gmail-sending.md). It requires the owner to authorize Google access, secure Supabase credentials, `EMAIL_PROVIDER=gmail`, `NOTIFICATION_MODE=owner_and_customer`, and deployment of the updated function. Gmail authorization is separate from GitHub/Resend sign-in. Resend's test sender remains restricted to the registered account email if you continue using Resend.
