# Owner and customer notifications through Gmail

This is an alternative to Resend when no sender domain can be verified. The existing `notify-orders` Edge Function supports Gmail API sending via `EMAIL_PROVIDER=gmail`. Gmail uses the owner's actual authorized mailbox and Google's sending limits. It requires one-time Google OAuth setup and ongoing authorization; it is not activated by deploying the website or signing into Resend with GitHub.

## 1. Google configuration (owner action)

1. Sign in to Google Cloud Console with the Gmail account that will send mail. Create/select a project and enable the **Gmail API**.
2. Configure **Google Auth Platform / OAuth consent**. Give the application a recognizable name, support email and developer contact. For a personal Gmail account, choose an external audience and add the owner as a test user while testing. Request only `https://www.googleapis.com/auth/gmail.send`.
3. Create an **OAuth client → Web application**. Add this exact authorized redirect URI for the authorization helper:
   `https://developers.google.com/oauthplayground`
4. Open Google's OAuth Playground. In its settings, select **Use your own OAuth credentials**, then enter the client ID and client secret directly there. Select **Offline** access. Do not paste credentials into chat, repository files or website settings.
5. In Step 1, enter the `gmail.send` scope above, authorize the application, and select the intended owner Gmail account. Review Google's requested access. In Step 2, exchange the authorization code for tokens. Store the resulting refresh token directly in Supabase secrets.
6. Google OAuth apps in Testing can issue refresh tokens for Gmail scopes that expire after seven days. Before relying on unattended production alerts, configure an appropriate production consent status and follow Google's applicable verification requirements. Revoking access or changing security settings can also require reauthorization. This is not a promise of indefinitely valid tokens.

The Google account owner must grant consent personally. Connecting GitHub or Resend does not authorize Gmail. Sending permission allows this app to send messages from the account; it does not grant permission to read its inbox. A separate dedicated store Gmail is preferable to a personal mailbox.

## 2. Supabase Edge Function secrets

Set these securely; never use `VITE_` variables for credentials:

| Name                  | Value                                                  |
| --------------------- | ------------------------------------------------------ |
| `EMAIL_PROVIDER`      | `gmail`                                                |
| `GMAIL_FROM_EMAIL`    | The exact Gmail address authorized above               |
| `GMAIL_CLIENT_ID`     | Your Google OAuth client ID                            |
| `GMAIL_CLIENT_SECRET` | Your Google OAuth client secret                        |
| `GMAIL_REFRESH_TOKEN` | The refresh token obtained above                       |
| `NOTIFICATION_MODE`   | `owner_and_customer`                                   |
| `STORE_URL`           | `https://innovativedeciphering.github.io/SeharCrafts/` |
| `NOTIFICATION_SECRET` | Keep your existing securely generated shared secret    |

The Gmail provider does not require `RESEND_API_KEY` or `FROM_EMAIL`. Existing Resend settings may stay stored for rollback. The function uses Google's HTTPS API, avoiding SMTP ports, Gmail passwords and frontend credentials. The owner receiving address is the private notification email saved in the owner studio; it can equal the sending Gmail.

## 3. Deploy, schedule and test

1. Replace/redeploy `notify-orders` using the latest `supabase/functions/notify-orders/index.ts`. Keep its dedicated shared-secret check and disabled built-in JWT setting as documented for this server-to-server function.
2. Keep/create the minute-by-minute Supabase Cron job using the matching `x-notification-secret` from Vault. Inspect pending historical test events before enabling the schedule; it will attempt to send them too.
3. Place a new test order through the website, using an inbox you control as the customer address. Trigger the function and verify its response reports `provider: gmail`, `notification_mode: owner_and_customer`, `failed: 0`.
4. Check the owner's Gmail and the customer's inbox/spam folder. Owner confirmation, dispatch, payment changes and cancellation each queue further messages. Verify at least an order placement and owner-confirmation email in both inboxes.
5. Monitor Edge Function logs, Gmail sending failures and `notification_events.last_error`. `invalid_grant` at Google normally means consent/token needs attention; no event is acknowledged if token refresh fails. Delivery is not established solely by API acceptance or a successful website build.

The provider respects Gmail's account limits and anti-abuse controls. Notifications are transactional order updates, not marketing campaigns. The current queue is at-least-once delivery: unlike Resend, Gmail's send endpoint does not offer the same idempotency keys. A partial send failure, overlapping scheduler invocations, or a crash before acknowledgement can duplicate an email on retry. Use a single scheduler, monitor failures and avoid repeatedly invoking a failing batch. High-volume use needs a queue with recipient-level acknowledgements and leases, or a verified transactional-email provider.

Customer confirmation here distinguishes **order request received** at checkout from **order confirmed** after the owner marks the order confirmed. Payment is manually recorded; an email never independently verifies bank payment.

## Current activation status

Code and mocked routing/error tests are prepared. Google OAuth credentials, hosted-function deployment, Cron configuration and real inbox delivery have not been verified by the agent. The owner must complete the secure Google authorization before live Gmail sending can be tested.
